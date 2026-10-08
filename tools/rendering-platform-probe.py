#!/usr/bin/env python3
"""Diagnostic only; original strict pixel gates remain unchanged.

Compare raster invalidation between browser versions and record real adapters.
No diagnostic CSS variant is installed by the shipped application.
"""
import argparse, functools, http.server, io, json, platform, threading
from pathlib import Path
from PIL import Image, ImageChops
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'reports/platform-probe';OUT.mkdir(parents=True,exist_ok=True)
parser=argparse.ArgumentParser();parser.add_argument('--software',action='store_true');args=parser.parse_args()
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args): pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=ROOT))
threading.Thread(target=server.serve_forever,daemon=True).start()
report={'platform':platform.platform(),'softwareRequested':args.software,'experiments':[],'claims':{'physicalDeviceQualified':False,'wholeIDEFaster':False}}
def diff(a,b):
    a,b=[Image.open(io.BytesIO(x)).convert('RGB') for x in [a,b]]
    assert a.size==b.size
    d=ImageChops.difference(a,b)
    return {'changedPixels':sum(bool(r or g or b) for r,g,b in d.getdata()),'bounds':d.getbbox()}
try:
    with sync_playwright() as pw:
        flags=['--no-sandbox']
        if args.software:flags+=['--enable-gpu','--enable-unsafe-webgpu','--enable-unsafe-swiftshader','--use-angle=swiftshader','--use-vulkan=swiftshader','--enable-features=Vulkan','--ignore-gpu-blocklist']
        browser=pw.chromium.launch(headless=False,args=flags)
        report.update(browser=browser.version,flags=flags)
        variants=[('unchanged',''),('native-clip-isolation','.mdi-client,.layout-monitor{isolation:isolate}'),('native-paint-containment','.mdi-client,.layout-monitor{contain:paint}'),('native-composite-isolation','.mdi-client,.layout-monitor{will-change:opacity}')]
        for name,css in variants:
            for iteration in range(2):
                page=browser.new_page(viewport={'width':1280,'height':800},device_scale_factor=1.5)
                errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
                page.goto(f'http://127.0.0.1:{server.server_port}/dist/VB6-Studio-Web.html')
                page.wait_for_function('window.vb6Studio?.rendering');page.evaluate('vb6Studio.rendering.ready');page.evaluate('vb6Studio.setRenderingPolicy({backend:"html"})')
                if css:page.add_style_tag(content=css)
                page.evaluate('document.fonts.ready');page.wait_for_timeout(250)
                reference=page.screenshot();prefix=f'{name}-{iteration}';(OUT/f'{prefix}-html.png').write_bytes(reference)
                experiment={'variant':name,'iteration':iteration,'switches':[]};report['experiments'].append(experiment)
                for backend in ['canvas2d','webgpu','webgl2']:
                    for repeat in range(2):
                        page.evaluate('b=>vb6Studio.setRenderingPolicy({backend:b,fallbacks:["html"]})',backend);page.wait_for_timeout(100)
                        active=page.evaluate('vb6Studio.rendering.getStats()');image=page.screenshot();comparison=diff(reference,image)
                        entry={'requested':backend,'active':active['active'],'adapter':active['adapter'],'attempts':active['attempts'],'repeat':repeat,'comparison':comparison}
                        experiment['switches'].append(entry)
                        if comparison['changedPixels']:
                            (OUT/f'{prefix}-{backend}-{repeat}.png').write_bytes(image)
                            x,y=comparison['bounds'][:2]
                            entry['atDifference']=page.evaluate('''([x,y])=>document.elementsFromPoint((x+.5)/devicePixelRatio,(y+.5)/devicePixelRatio).slice(0,8).map(n=>{const r=n.getBoundingClientRect(),s=getComputedStyle(n);return {tag:n.tagName,class:n.className,rect:r.toJSON(),border:s.border,shadow:s.boxShadow,background:s.backgroundImage,transform:s.transform}})''',[x,y])
                            if active['active']!='html':
                                page.evaluate('vb6Studio.rendering.canvas.style.visibility="hidden"');page.wait_for_timeout(100)
                                hidden=page.screenshot();entry['hidden']=diff(reference,hidden);(OUT/f'{prefix}-{backend}-{repeat}-hidden.png').write_bytes(hidden)
                        page.evaluate('vb6Studio.setRenderingPolicy({backend:"html"})');page.wait_for_timeout(100)
                        image=page.screenshot();entry['returnedHTML']=diff(reference,image)
                        if entry['returnedHTML']['changedPixels']:(OUT/f'{prefix}-{backend}-{repeat}-restored.png').write_bytes(image)
                experiment['errors']=errors;page.context.close()
                print(prefix,json.dumps(experiment),flush=True)
        page=browser.new_page(viewport={'width':1280,'height':800})
        page.goto(f'http://127.0.0.1:{server.server_port}/dist/VB6-Studio-Web.html');page.wait_for_function('window.vb6Studio?.rendering');page.evaluate('vb6Studio.rendering.ready')
        page.add_script_tag(url=f'http://127.0.0.1:{server.server_port}/dist/vb6-rendering.js')
        report['localMeasurement']=page.evaluate('''async()=>{try{return await VB6Rendering.benchmarkRendering(document,{frames:60,quads:10000,backends:['webgpu','webgl2','canvas2d']});}catch(e){return {error:String(e)}}}''')
        report['pairedIDE']=page.evaluate('''async()=>{
            const results=[],r=vb6Studio.rendering,caption=document.querySelector('.vb-form-title .caption');
            if(!caption)throw Error('Real form caption missing');const original=caption.textContent;
            const raf=()=>new Promise(resolve=>requestAnimationFrame(resolve));
            for(let round=0;round<4;round++)for(const backend of round%2?['webgpu','html']:['html','webgpu']){
                await vb6Studio.setRenderingPolicy({backend,fallbacks:['html']});
                if(r.backend!==backend){results.push({backend,active:r.backend,error:'requested backend unavailable',stats:r.getStats()});continue;}
                await raf();await raf();r.metrics.builds=[];r.metrics.submissions=[];
                const framesBefore=r.metrics.frames,buildsBefore=r.metrics.sceneBuilds,samples=[];let previous=await raf();
                for(let i=0;i<120;i++){
                    const t=performance.now();caption.textContent='Rendering comparison '+(i%2);
                    const next=await raf();samples.push({frameInterval:next-previous,eventToRAF:performance.now()-t});previous=next;
                }
                results.push({backend,round,samples,frames:r.metrics.frames-framesBefore,builds:r.metrics.sceneBuilds-buildsBefore,stats:r.getStats()});
            }
            caption.textContent=original;await vb6Studio.setRenderingPolicy({backend:'html'});return results;
        }''')
        browser.close()
except Exception as error:
    report['error']=str(error);raise
finally:
    (OUT/'report.json').write_text(json.dumps(report,indent=2));server.shutdown()
