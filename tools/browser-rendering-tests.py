#!/usr/bin/env python3
"""Rendering integration and real-backend readback tests.

--require-webgpu serves localhost and refuses to count a fallback as WebGPU.
Without that flag, set_content supports restricted environments; unavailable GPU
backends are explicitly skipped. Reports distinguish functional correctness,
pixel parity with our HTML path, CPU timing and physical-hardware qualification.
"""
from __future__ import annotations
import argparse, functools, http.server, io, json, os, platform, shutil, threading, time, traceback
from pathlib import Path
from PIL import Image, ImageChops
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'reports/rendering'
RESULTS, METRICS, VISUAL = [], {}, []
ARGS = argparse.ArgumentParser()
ARGS.add_argument('--require-webgpu', action='store_true')
args = ARGS.parse_args()
OUT.mkdir(parents=True, exist_ok=True)
BUNDLE = (ROOT / 'dist/vb6-rendering.js').read_text()
IDE = (ROOT / 'dist/VB6-Studio-Web.html').read_text()
URL = None
if args.require_webgpu:
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *args): pass
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=ROOT))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    URL = f'http://127.0.0.1:{server.server_port}/'

def check(ok, message):
    if not ok: raise AssertionError(message)

def case(name, fn):
    start = time.perf_counter()
    existing_contexts = set(browser.contexts)
    try:
        details = fn()
        RESULTS.append({'name': name, 'passed': True, 'details': details, 'ms': round((time.perf_counter()-start)*1000, 2)})
        print('SKIP' if isinstance(details, dict) and details.get('skipped') else 'PASS', name, flush=True)
    except Exception as e:
        RESULTS.append({'name': name, 'passed': False, 'error': str(e)})
        traceback.print_exc(limit=3)
        print('FAIL', name, str(e), flush=True)
    finally:
        # A failed assertion must not exhaust the browser's context/GPU budget.
        for context in browser.contexts:
            if context not in existing_contexts: context.close()

def new_page(browser, dpr=1, ide=False):
    page = browser.new_page(viewport={'width': 1280, 'height': 800}, device_scale_factor=dpr)
    page.errors = []
    page.on('pageerror', lambda error: page.errors.append(str(error)))
    if URL: page.goto(URL + ('dist/VB6-Studio-Web.html' if ide else ''))
    if ide:
        if not URL: page.set_content(IDE)
        page.wait_for_function('window.vb6Studio?.rendering')
        page.evaluate('vb6Studio.rendering.ready')
    else:
        page.set_content('<!doctype html><html><head><style>html,body{margin:0;background:white}</style></head><body></body></html>')
    page.add_script_tag(content=BUNDLE)
    return page

def pixels(a, b):
    first, second = Image.open(io.BytesIO(a)).convert('RGB'), Image.open(io.BytesIO(b)).convert('RGB')
    check(first.size == second.size, 'Framebuffer dimensions differ')
    diff = ImageChops.difference(first, second)
    data = list(diff.getdata())
    count = sum(any(p) for p in data)
    return {'changedPixels': count, 'pixels': len(data), 'fraction': count / len(data), 'maxChannelError': max(max(p) for p in data), 'meanChannelError': sum(sum(p) for p in data)/(len(data)*3)}

with sync_playwright() as playwright:
    executable = os.environ.get('CHROMIUM_PATH') or shutil.which('chromium') or playwright.chromium.executable_path
    launch_flags = ['--no-sandbox', '--enable-unsafe-webgpu', '--enable-unsafe-swiftshader', '--use-angle=swiftshader']
    browser = playwright.chromium.launch(executable_path=executable, headless=True, args=launch_flags)
    METRICS.update(browser=browser.version, platform=platform.platform(), flags=launch_flags, physicalHardwareQualified=False)

    def backend_execution():
        page = new_page(browser)
        outcome = page.evaluate('''async()=>{const result={};for(const backend of ['webgpu','webgl2','canvas2d']){const c=document.createElement('canvas');document.body.append(c);let p;try{p=await VB6Rendering.createPainter(backend,c);const s=new VB6Rendering.PaintScene(20,20);s.add([0,0,20,20],[1,0,0,1]);p.render(s);if(p.device)await p.device.queue.onSubmittedWorkDone();result[backend]={available:true,adapter:p.adapterInfo||null};}catch(e){result[backend]={available:false,reason:e.message};}finally{p?.dispose();c.remove();}}return result}''')
        METRICS['backends'] = outcome
        check(outcome['canvas2d']['available'], 'Canvas2D missing')
        if args.require_webgpu:
            check(outcome['webgpu']['available'], 'REAL WebGPU required, no fallback accepted: ' + str(outcome))
            check(outcome['webgl2']['available'], 'REAL WebGL2 required: ' + str(outcome))
        METRICS['backends'] = outcome; page.close(); return outcome
    case('real backend initialization and shader execution', backend_execution)

    for dpr in [1, 1.25, 1.5, 2, 3, 4]:
        def primitive_parity(dpr=dpr):
            page = new_page(browser, dpr)
            images, info = {}, {}
            for backend in ['canvas2d', 'webgl2', 'webgpu']:
                if not METRICS.get('backends', {}).get(backend, {}).get('available'): continue
                info[backend] = page.evaluate('''async({backend,dpr})=>{
                  window.painter?.dispose();document.querySelector('canvas.fixture')?.remove();
                  const canvas=document.createElement('canvas');canvas.className='fixture';canvas.style.cssText='display:block;width:256px;height:128px';document.body.append(canvas);
                  const p=window.painter=await VB6Rendering.createPainter(backend,canvas),s=new VB6Rendering.PaintScene(256,128,{dpr});
                  s.add([0,0,256,128],[0,0,0,1]);s.add([0,0,128,64],[1,0,0,1]);s.add([128,0,128,64],[0,1,0,1]);
                  s.add([0,64,128,64],[0,0,1,1]);s.add([128,64,128,64],[1,1,1,1]);
                  s.add([16,16,64,32],[1,1,0,1],{clip:[32,16,32,32]});s.native([4,4,4,4],s.clip);
                  const image=document.createElement('canvas');image.width=image.height=16;const c=image.getContext('2d');c.fillStyle='#00ffff';c.fillRect(0,0,16,8);c.fillStyle='#ff00ff';c.fillRect(0,8,16,8);
                  s.add([160,16,16,16],[1,1,1,1],{page:{canvas:image,width:16,height:16,revision:1}});
                  p.render(s);if(p.device)await p.device.queue.onSubmittedWorkDone();
                  return {name:p.name,width:canvas.width,height:canvas.height,stats:p.stats};
                }''', {'backend': backend, 'dpr': dpr})
                images[backend] = page.locator('canvas.fixture').screenshot()
                (OUT / f'primitives-{backend}-{dpr}.png').write_bytes(images[backend])
                check(info[backend]['width'] == round(256*dpr), 'DPR was capped or ignored')
            check('canvas2d' in images, 'Reference backend did not execute')
            if args.require_webgpu: check('webgpu' in images and 'webgl2' in images, 'Required GPU backend did not execute')
            comparisons = {backend: pixels(images['canvas2d'], image) for backend, image in images.items() if backend != 'canvas2d'}
            for backend, comparison in comparisons.items():
                check(comparison['changedPixels'] == 0, f'{backend} solid/clip/texture pixel mismatch at DPR {dpr}: {comparison}')
            check(not page.errors, str(page.errors)); page.close(); return {'info': info, 'comparisons': comparisons}
        case(f'exact solid, clip, hole and texture pixels at DPR {dpr}', primitive_parity)

    def ide_workflow():
        page = new_page(browser, ide=True); renderer = 'vb6Studio.rendering'
        check(page.evaluate(renderer+'.policy.backend') == 'webgpu', 'WebGPU is not default')
        if args.require_webgpu: check(page.evaluate(renderer+'.backend') == 'webgpu', 'IDE fallback: ' + json.dumps(page.evaluate(renderer+'.getStats()')))
        page.evaluate('vb6Studio.optionsDialog();undefined');page.get_by_role('tab', name='Rendering', exact=True).click()
        page.get_by_label('UI rendering backend').select_option('html');page.get_by_role('button', name='Cancel', exact=True).click()
        check(page.evaluate(renderer+'.policy.backend') == 'webgpu', 'Cancel changed policy')
        page.evaluate('vb6Studio.optionsDialog();undefined');page.get_by_role('tab', name='Rendering', exact=True).click()
        page.get_by_label('UI rendering backend').select_option('html');page.get_by_label('Use these settings in exported applications').check()
        page.get_by_role('button', name='OK', exact=True).click(); page.wait_for_function(renderer+'.backend === "html"')
        check(page.locator('[data-vb-render-layer]').count() == 0, 'HTML retained a rendering overlay')
        check(page.evaluate('vb6Studio.project.settings.rendering.backend') == 'html', 'Export policy not stored')
        page.evaluate('vb6Studio.setRenderingPolicy({backend:"canvas2d",fallbacks:["html"]})')
        page.wait_for_function(renderer+'.backend === "canvas2d"')
        page.wait_for_timeout(250)
        frames = page.evaluate(renderer+'.metrics.frames');page.wait_for_timeout(350)
        check(page.evaluate(renderer+'.metrics.frames') == frames, 'Idle UI continuously redraws')
        page.evaluate('vb6Studio.optionsDialog();undefined');page.get_by_role('tab', name='Rendering', exact=True).click();page.screenshot(path=OUT/'options.png')
        page.get_by_role('button', name='Cancel', exact=True).click()
        check(not page.errors, str(page.errors)); stats=page.evaluate(renderer+'.getStats()');page.close();return stats
    case('classic Options cancel/apply/export and idle scheduling', ide_workflow)

    def fallback_lifecycle():
        page = new_page(browser)
        result = page.evaluate('''async()=>{
          let lost, disposed=0;const attempts=[];
          const factory=async(name,canvas,options)=>{attempts.push(name);if(name==='webgpu')throw Error('denied adapter');if(name==='webgl2'){lost=options.onLost;return {name,stats:{},render(){canvas.width=10;canvas.height=10},dispose(){disposed++}};}return VB6Rendering.createPainter(name,canvas,options)};
          const r=new VB6Rendering.UIRenderer(document,{fallbacks:['webgl2','canvas2d','html']},{factory});await r.ready;
          const first=r.backend;lost('simulated loss');await r.ready;const second=r.backend;
          await r.setOptions({backend:'html'});const clean=document.querySelectorAll('[data-vb-render-layer]').length===0;
          r.dispose();r.dispose();return {first,second,clean,disposed,attempts};
        }''')
        check(result == {'first':'webgl2','second':'canvas2d','clean':True,'disposed':1,'attempts':['webgpu','webgl2','canvas2d']}, 'Fallback lifecycle: '+str(result))
        # Asynchronous startup must never resurrect an obsolete backend.
        race = page.evaluate('''async()=>{let resolve,disposed=0;const r=new VB6Rendering.UIRenderer(document,{backend:'webgpu'},{factory:()=>new Promise(done=>{resolve=()=>done({render(){},dispose(){disposed++},stats:{}})})});const pending=r.ready;await r.setOptions({backend:'html'});resolve();await pending;const result={active:r.backend,canvases:document.querySelectorAll('[data-vb-render-layer]').length,disposed};r.dispose();return result}''')
        check(race == {'active':'html','canvases':0,'disposed':1}, 'Stale initialization won: '+str(race));page.close();return {'loss':result,'race':race}
    case('ordered failure, context loss, cleanup and stale-start race', fallback_lifecycle)

    def live_loss():
        if not args.require_webgpu: return {'skipped': 'Real GPU loss requires GPU-enabled browser; not simulated certification'}
        page = new_page(browser)
        result=page.evaluate('''async()=>{const r=window.r=new VB6Rendering.UIRenderer(document,{fallbacks:['webgl2','canvas2d','html']});await r.ready;if(r.backend!=='webgpu')throw Error(JSON.stringify(r.getStats()));r.driver.device.destroy();await new Promise(resolve=>setTimeout(resolve,250));await r.ready;return r.getStats()}''')
        check(result['active']=='webgl2','WebGPU loss did not select WebGL2: '+str(result))
        page.evaluate("r.driver.gl.getExtension('WEBGL_lose_context').loseContext()")
        page.wait_for_function('r.backend === "canvas2d"');page.evaluate('r.dispose()');page.close();return result
    case('actual GPUDevice destruction and WebGL context loss', live_loss)

    def reference_counts():
        page = new_page(browser)
        result=page.evaluate('''async()=>{const a=VB6Rendering.retainRenderer(document,{backend:'canvas2d'}),b=VB6Rendering.retainRenderer(document,{backend:'html'});await a.renderer.ready;const same=a.renderer===b.renderer;a.release();a.release();const alive=!b.renderer.disposed;b.release();return {same,alive,disposed:b.renderer.disposed,canvases:document.querySelectorAll('[data-vb-render-layer]').length}}''')
        check(result=={'same':True,'alive':True,'disposed':True,'canvases':0}, str(result));page.close();return result
    case('shared-document reference counts and idempotent cleanup', reference_counts)

    for dpr in [1, 1.25, 1.5, 2]:
        def ide_visual(dpr=dpr):
            page=new_page(browser,dpr,ide=True)
            page.evaluate('vb6Studio.setRenderingPolicy({backend:"html"})');page.wait_for_timeout(250)
            baseline=page.screenshot();(OUT/f'ide-html-{dpr}.png').write_bytes(baseline)
            for backend in ['canvas2d','webgl2','webgpu']:
                if not METRICS.get('backends',{}).get(backend,{}).get('available'):continue
                page.evaluate('backend=>vb6Studio.setRenderingPolicy({backend,fallbacks:["html"],text:"native"})',backend)
                check(page.evaluate('vb6Studio.rendering.backend')==backend, 'Visual case did not use '+backend)
                page.wait_for_timeout(150);image=page.screenshot();(OUT/f'ide-{backend}-{dpr}.png').write_bytes(image)
                comparison=pixels(baseline,image);comparison.update(backend=backend,dpr=dpr);VISUAL.append(comparison)
                # This is a regression guard, not a claim of pixel-perfect parity.
                check(comparison['fraction']<.01,'More than 1% of IDE pixels differ: '+str(comparison))
                check(comparison['meanChannelError']<.5,'IDE mean error exceeds guard: '+str(comparison))
            comparisons = [v for v in VISUAL if v['dpr']==dpr]
            check(bool(comparisons), 'No visual backends executed')
            if args.require_webgpu: check(any(v['backend']=='webgpu' for v in comparisons), 'GPU visual comparison did not execute')
            check(not page.errors,str(page.errors));page.close();return comparisons
        case(f'HTML-vs-renderer visual evidence at DPR {dpr}',ide_visual)

    def benchmark():
        page=new_page(browser,ide=True)
        stats=page.evaluate('''()=>{const r=vb6Studio.rendering;r.metrics.builds=[];r.metrics.submissions=[];for(let i=0;i<50;i++)r.renderNow();return r.getStats()}''')
        METRICS['ideForcedRebuildCpu']=stats
        # A reusable library workload: all opaque quads must batch to one draw.
        batch=page.evaluate('''async()=>{const backend=window.navigator.gpu?'webgpu':'canvas2d';let c=document.createElement('canvas');document.body.append(c);let p;try{p=await VB6Rendering.createPainter(backend,c)}catch{c.remove();c=document.createElement('canvas');document.body.append(c);p=await VB6Rendering.createPainter('canvas2d',c)}const s=new VB6Rendering.PaintScene(1024,1024);for(let i=0;i<10000;i++)s.add([i%100*10,Math.floor(i/100)*10,8,8],[.2,.4,.8,1]);const times=[];for(let i=0;i<60;i++){const t=performance.now();p.render(s);times.push(performance.now()-t)}if(p.device)await p.device.queue.onSubmittedWorkDone();times.sort((a,b)=>a-b);const result={backend:p.name,quads:10000,frames:60,cpuSubmitP50Ms:times[30],cpuSubmitP95Ms:times[57],stats:p.stats};p.dispose();c.remove();return result}''')
        if args.require_webgpu: check(batch['backend']=='webgpu', 'Batch workload silently fell back: '+str(batch))
        if batch['backend']=='webgpu':
            check(batch['stats']['drawCalls']==1,'Opaque quads were not batched')
            check(batch['stats']['bufferAllocations']==1,'Buffer was reallocated every frame')
        METRICS['batch10000Quads']=batch;page.close();return {'ide':stats,'batch':batch}
    case('forced rebuild CPU metrics and retained 10,000-quad batching',benchmark)
    browser.close()

report={'results':RESULTS,'metrics':METRICS,'visual':VISUAL,'claims':{
 'physicalHardwarePerformanceConfirmed':False,
 'fullWebGPUWithoutDOMPainting':False,
 'zeroPixelDifferenceInTestedIDEImages':bool(VISUAL) and all(v['changedPixels']==0 for v in VISUAL),
 'nativeVB6WindowsGoldenComparison':False,
 'note':'Native input/editing/icons and unsupported CSS remain DOM-rendered. CPU measurements and software GPU tests do not establish hardware speedup.'}}
(OUT/'report.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report['claims'],indent=2))
if URL: server.shutdown()
raise SystemExit(0 if all(result['passed'] for result in RESULTS) else 1)
