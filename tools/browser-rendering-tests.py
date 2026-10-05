#!/usr/bin/env python3
"""Rendering integration and real-backend readback tests.

--require-webgpu / --require-webgl2 serve localhost and reject backend fallbacks.
Without that flag, set_content supports restricted environments; unavailable GPU
backends are explicitly skipped. Reports distinguish functional correctness,
pixel parity with our HTML path, CPU timing and physical-hardware qualification.
"""
from __future__ import annotations
import argparse, base64, functools, http.server, io, json, os, platform, shlex, shutil, threading, time, traceback
from pathlib import Path
from PIL import Image, ImageChops
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'reports/rendering'
RESULTS, METRICS, VISUAL = [], {}, []
ARGS = argparse.ArgumentParser()
ARGS.add_argument('--require-webgpu', action='store_true')
ARGS.add_argument('--require-webgl2', action='store_true')
ARGS.add_argument('--headed', action='store_true')
ARGS.add_argument('--software-gpu', action='store_true', help='Explicit CI software adapter, never physical-GPU qualification')
args = ARGS.parse_args()
REQUIRED = [name for name, enabled in [('webgpu', args.require_webgpu), ('webgl2', args.require_webgl2)] if enabled]
OUT.mkdir(parents=True, exist_ok=True)
BUNDLE = (ROOT / 'dist/vb6-rendering.js').read_text()
IDE = (ROOT / 'dist/VB6-Studio-Web.html').read_text()
URL = None
if REQUIRED:
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
    page.on('console', lambda message: METRICS.setdefault('browserWarnings', []).append(message.text) if message.type in ('warning', 'error') and len(METRICS.get('browserWarnings', [])) < 100 else None)
    if URL: page.goto(URL + ('dist/VB6-Studio-Web.html' if ide else 'tests/fixtures/rendering.html'))
    if ide:
        if not URL: page.set_content(IDE)
        page.wait_for_function('window.vb6Studio?.rendering')
        page.evaluate('vb6Studio.rendering.ready')
    elif not URL:
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
    # Browser flags belong to this test runner, never the shipped IDE/runtime.
    # Source: https://developer.chrome.com/blog/supercharge-web-ai-testing
    launch_flags = ['--no-sandbox']
    if args.software_gpu:
        launch_flags += ['--enable-unsafe-webgpu', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--use-vulkan=swiftshader']
    launch_flags += shlex.split(os.environ.get('RENDERING_BROWSER_FLAGS', ''))
    browser = playwright.chromium.launch(executable_path=executable, headless=not args.headed, args=launch_flags)
    METRICS.update(requiredBackends=REQUIRED, browser=browser.version, platform=platform.platform(), flags=launch_flags, physicalHardwareQualified=False, headed=args.headed, softwareGpuRequested=args.software_gpu)

    def backend_execution():
        page = new_page(browser)
        outcome = page.evaluate('''async()=>{const result={};for(const backend of ['webgpu','webgl2','canvas2d']){const c=document.createElement('canvas');document.body.append(c);let p;try{p=await VB6Rendering.createPainter(backend,c);const s=new VB6Rendering.PaintScene(20,20);s.add([0,0,20,20],[1,0,0,1]);p.render(s);if(p.device)await p.device.queue.onSubmittedWorkDone();result[backend]={available:true,adapter:p.adapterInfo||null,outputVerified:p.stats.outputVerified??null};}catch(e){result[backend]={available:false,reason:e.message};}finally{p?.dispose();c.remove();}}return result}''')
        METRICS['backends'] = outcome
        check(outcome['canvas2d']['available'], 'Canvas2D missing')
        for backend in REQUIRED:
            check(outcome[backend]['available'], 'REAL '+backend+' required, no fallback accepted: ' + str(outcome))
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
                  let readback=null;
                  if(p.device){
                    const image=await p.render(s,{readback:true}),rgba=image.data;
                    let text='';for(let i=0;i<rgba.length;i+=8192)text+=String.fromCharCode(...rgba.subarray(i,i+8192));readback=btoa(text);
                  }else p.render(s);
                  return {name:p.name,width:canvas.width,height:canvas.height,stats:p.stats,readback};
                }''', {'backend': backend, 'dpr': dpr})
                raw = info[backend].pop('readback', None)
                if raw:
                    rgba = Image.frombytes('RGBA', (info[backend]['width'],info[backend]['height']), base64.b64decode(raw))
                    displayed = Image.new('RGBA', rgba.size, (255,255,255,255));displayed.alpha_composite(rgba)
                    encoded = io.BytesIO();displayed.convert('RGB').save(encoded, format='PNG')
                    (OUT / f'framebuffer-{backend}-{dpr}.png').write_bytes(encoded.getvalue())
                    comparison = pixels(images['canvas2d'], encoded.getvalue())
                    METRICS.setdefault('gpuFramebufferReadback', []).append({'backend':backend,'dpr':dpr,**comparison})
                    check(comparison['changedPixels']==0, 'GPU framebuffer differs before presentation: '+str(comparison))
                images[backend] = page.locator('canvas.fixture').screenshot()
                (OUT / f'primitives-{backend}-{dpr}.png').write_bytes(images[backend])
                check(info[backend]['width'] == round(256*dpr), 'DPR was capped or ignored')
            check('canvas2d' in images, 'Reference backend did not execute')
            for backend in REQUIRED: check(backend in images, 'Required '+backend+' did not execute')
            comparisons = {backend: pixels(images['canvas2d'], image) for backend, image in images.items() if backend != 'canvas2d'}
            if not comparisons:
                page.close();return {'skipped':'No second renderer available for a cross-backend pixel comparison','info':info}
            METRICS.setdefault('presentationPixels', []).extend({'backend':backend,'dpr':dpr,**comparison} for backend,comparison in comparisons.items())
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
        # Allow pending activation/focus/resize invalidations to settle, then
        # enforce no further submissions across a separate idle interval.
        page.evaluate('''async()=>{const r=vb6Studio.rendering;let last=r.metrics.frames,stable=0;for(let i=0;i<30;i++){await new Promise(done=>setTimeout(done,50));const now=r.metrics.frames;stable=now===last?stable+1:0;last=now;if(stable>=4)return;}throw Error('Renderer did not reach quiescence')}''')
        # Background IDE analysis may finish after the settings dialog closes.
        # A draw caused by real DOM changes is not idle. Conversely, canvas-layer
        # writes are excluded so a self-triggered render loop still fails.
        idle=page.evaluate('''async()=>{
          const r=vb6Studio.rendering;await document.fonts.ready;
          let changes=[];
          const observer=new MutationObserver(records=>changes.push(...records));
          observer.observe(document.documentElement,{subtree:true,childList:true,attributes:true,characterData:true});
          let busyIntervals=0;
          try {
            for(let i=0;i<20;i++) {
              // Let pending invalidations settle; retain delivered records instead
              // of losing them in an empty MutationObserver callback.
              await new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)));
              changes=[];observer.takeRecords();const frames=r.metrics.frames;
              await new Promise(done=>setTimeout(done,350));
              const records=[...changes,...observer.takeRecords()].filter(change=>{
                const n=change.target.nodeType===1?change.target:change.target.parentElement;
                return !n?.closest('[data-vb-render-layer]');
              });
              if(records.length){busyIntervals++;continue;}
              return {busyIntervals,idleFrames:r.metrics.frames-frames};
            }
            throw Error('IDE remained busy for every observation interval');
          } finally {observer.disconnect();}
        }''')
        check(idle['idleFrames']==0,'Idle UI continuously redraws: '+str(idle))
        METRICS['idleObservation']=idle
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

    def live_gpu_loss():
        if not METRICS.get('backends',{}).get('webgpu',{}).get('available'):
            check('webgpu' not in REQUIRED, 'Required WebGPU loss test cannot execute')
            return {'skipped':'WebGPU unavailable; required in the separate WebGPU CI job'}
        page=new_page(browser)
        result=page.evaluate('''async()=>{
          const r=window.r=new VB6Rendering.UIRenderer(document,{fallbacks:['webgl2','canvas2d','html']});
          await r.ready;if(r.backend!=='webgpu')throw Error(JSON.stringify(r.getStats()));
          r.driver.device.destroy();
          await new Promise(resolve=>setTimeout(resolve,250));await r.ready;
          return r.getStats();
        }''')
        expected='webgl2' if METRICS['backends'].get('webgl2',{}).get('available') else 'canvas2d'
        check(result['active']==expected,'Device loss did not choose first available fallback: '+str(result))
        page.evaluate('r.dispose()');page.close();return result
    case('actual GPUDevice destruction and ordered available fallback',live_gpu_loss)

    def live_gl_loss():
        if not METRICS.get('backends',{}).get('webgl2',{}).get('available'):
            check('webgl2' not in REQUIRED,'Required WebGL2 loss test cannot execute')
            return {'skipped':'WebGL2 unavailable; required in the separate WebGL2 CI job'}
        page=new_page(browser)
        page.evaluate('''async()=>{
          const r=window.r=new VB6Rendering.UIRenderer(document,{backend:'webgl2',fallbacks:['canvas2d','html']});
          await r.ready;if(r.backend!=='webgl2')throw Error(JSON.stringify(r.getStats()));
          const extension=r.driver.gl.getExtension('WEBGL_lose_context');
          if(!extension)throw Error('WEBGL_lose_context missing');extension.loseContext();
        }''')
        page.wait_for_function('r.backend === "canvas2d"');result=page.evaluate('r.getStats()');
        page.evaluate('r.dispose()');page.close();return result
    case('actual WebGL2 context loss and Canvas2D recovery',live_gl_loss)

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
                # Exact reference fixture equality; never tolerate a blank GPU overlay.
                check(comparison['changedPixels']==0,'IDE pixels differ: '+str(comparison))
            comparisons = [v for v in VISUAL if v['dpr']==dpr]
            check(bool(comparisons), 'No visual backends executed')
            for backend in REQUIRED: check(any(v['backend']==backend for v in comparisons), backend+' visual comparison did not execute')
            check(not page.errors,str(page.errors));page.close();return comparisons
        case(f'HTML-vs-renderer visual evidence at DPR {dpr}',ide_visual)

    def live_invalidation():
        page = new_page(browser)
        backend = REQUIRED[0] if REQUIRED else 'canvas2d'
        result = page.evaluate('''async backend=>{
          document.body.innerHTML='<style id="s">#sample{position:absolute;left:20px;top:20px;width:40px;height:40px;background:rgb(255,0,0)}</style><div id="sample"></div>';
          const r=new VB6Rendering.UIRenderer(document,{backend,fallbacks:['html']});await r.ready;
          if(r.backend!==backend)throw Error(JSON.stringify(r.getStats()));
          const settle=()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done)));
          await settle();const before=r.metrics.frames,driverFrames=r.driver.stats.frames;
          const snapshot=r.retained.scene;
          for(let i=0;i<100;i++)r.renderNow();
          const stable={frames:r.metrics.frames-before,driverFrames:r.driver.stats.frames-driverFrames,identity:r.retained.scene===snapshot,skips:r.metrics.unchangedFrames};
          r.renderNow({force:true});const forced=r.metrics.frames-before;
          // CSSOM writes do not emit MutationObserver records. Inner-element
          // ResizeObserver tracking must catch this change without manual invalidation.
          document.querySelector('#s').sheet.cssRules[0].style.width='80px';
          await new Promise(done=>setTimeout(done,100));await settle();
          const resized=r.retained.scene.commands.some(c=>!c.hole&&c.color[0]===1&&c.rect[0]===20&&c.rect[2]===80);
          const rules=document.createElement('style');rules.textContent='@keyframes rendererProbe{from{background-color:rgb(255,0,0)}to{background-color:rgb(0,0,255)}}';document.head.append(rules);
          document.querySelector('#sample').style.animation='rendererProbe .16s linear forwards';
          await new Promise(done=>setTimeout(done,350));await settle();
          const animated=r.retained.scene.commands.some(c=>!c.hole&&c.rect[0]===20&&c.color[2]===1&&c.color[0]===0);
          const idleStart=r.metrics.frames;await new Promise(done=>setTimeout(done,100));const idleFrames=r.metrics.frames-idleStart;
          const targets=r.observedElements.size;
          await r.setOptions({backend:'html'});const clean=r.observedElements.size===0&&r.retained.scene===null;
          r.dispose();return {stable,forced,resized,animated,idleFrames,targets,clean};
        }''', backend)
        check(result['stable']['frames']==0 and result['stable']['driverFrames']==0 and result['stable']['identity'],str(result))
        check(result['forced']==1 and result['resized'] and result['animated'],str(result))
        check(result['idleFrames']==0 and result['targets']>0 and result['clean'],str(result))
        check(not page.errors,str(page.errors));page.close();return result
    case('retained live UI, CSSOM resize, animation completion and idle cleanup', live_invalidation)

    def replacement_texture():
        page = new_page(browser)
        backend = REQUIRED[0] if REQUIRED else 'canvas2d'
        result = page.evaluate('''async backend=>{
          const canvas=document.createElement('canvas');document.body.append(canvas);
          const painter=await VB6Rendering.createPainter(backend,canvas);
          const make=color=>{const c=document.createElement('canvas');c.width=c.height=2;const ctx=c.getContext('2d');ctx.fillStyle=color;ctx.fillRect(0,0,2,2);return c};
          const page={canvas:make('#ff0000'),width:2,height:2,revision:1};
          const scene=new VB6Rendering.PaintScene(32,32);scene.add([0,0,32,32],[1,1,1,1],{page});scene.seal();
          const read=async()=>{
            if(painter.device)return (await painter.render(scene,{readback:true})).data;
            painter.render(scene);const gl=painter.gl;
            if(gl){const data=new Uint8Array(32*32*4);gl.readPixels(0,0,32,32,gl.RGBA,gl.UNSIGNED_BYTE,data);return data;}
            return painter.context.getImageData(0,0,32,32).data;
          };
          const exact=(data,color)=>{for(let i=0;i<data.length;i++)if(data[i]!==color[i%4])return false;return data.length===32*32*4};
          try{
            const red=exact(await read(),[255,0,0,255]);page.canvas=make('#00ff00');
            const green=exact(await read(),[0,255,0,255]);
            return {backend:painter.name,red,green,instanceUploads:painter.stats.instanceUploads};
          }finally{painter.dispose();canvas.remove();}
        }''',backend)
        check(result['backend']==backend and result['red'] and result['green'],str(result))
        if backend!='canvas2d': check(result['instanceUploads']==1,'Texture replacement unnecessarily uploaded sealed geometry: '+str(result))
        check(not page.errors,str(page.errors));page.close();return result
    case('replaced texture source has exact new pixels without geometry upload',replacement_texture)

    def benchmark():
        page=new_page(browser,ide=True)
        if REQUIRED: page.evaluate('backend=>vb6Studio.setRenderingPolicy({backend,fallbacks:["html"]})',REQUIRED[0])
        stats=page.evaluate('''()=>{const r=vb6Studio.rendering;r.metrics.builds=[];r.metrics.submissions=[];for(let i=0;i<50;i++)r.renderNow({force:true});return r.getStats()}''')
        METRICS['ideForcedRebuildCpu']=stats
        # Complete this workload before initializing a second renderer; otherwise
        # its bounded startup readback sits behind 50 queued full-IDE submissions.
        # The isolated library benchmark must not measure unrelated IDE work.
        page.evaluate('''async()=>{const device=vb6Studio.rendering.driver?.device;if(device)await device.queue.onSubmittedWorkDone();await vb6Studio.setRenderingPolicy({backend:'html'})}''')
        page.context.close()
        page=new_page(browser)
        # A reusable library workload: all opaque quads must batch to one draw.
        batch=page.evaluate('''async backend=>{let c=document.createElement('canvas');document.body.append(c);let p;let initializationError=null;try{p=await VB6Rendering.createPainter(backend,c)}catch(error){initializationError=String(error);c.remove();c=document.createElement('canvas');document.body.append(c);p=await VB6Rendering.createPainter('canvas2d',c)}const s=new VB6Rendering.PaintScene(1024,1024);for(let i=0;i<10000;i++)s.add([i%100*10,Math.floor(i/100)*10,8,8],[.2,.4,.8,1]);s.seal();const times=[];for(let i=0;i<60;i++){const t=performance.now();p.render(s);times.push(performance.now()-t);if(p.device&&(i+1)%4===0)await p.device.queue.onSubmittedWorkDone()}if(p.device)await p.device.queue.onSubmittedWorkDone();times.sort((a,b)=>a-b);const result={backend:p.name,initializationError,quads:10000,frames:60,cpuSubmitP50Ms:times[30],cpuSubmitP95Ms:times[57],stats:p.stats};p.dispose();c.remove();return result}''', REQUIRED[0] if REQUIRED else next((b for b in ['webgpu','webgl2','canvas2d'] if METRICS.get('backends',{}).get(b,{}).get('available')), 'canvas2d'))
        METRICS['batch10000Quads']=batch
        if REQUIRED: check(batch['backend']==REQUIRED[0], 'Batch workload silently fell back: '+str(batch))
        if batch['backend'] in ['webgpu','webgl2']:
            check(batch['stats']['drawCalls']==1,'Opaque quads were not batched')
            check(batch['stats']['bufferAllocations']==1,'Buffer was reallocated every frame')
            check(batch['stats']['instanceUploads']==1,'Sealed geometry was uploaded every frame')
            check(batch['stats']['geometryPacks']==1,'Sealed geometry was repacked every frame')
            check(batch['stats']['batchBuilds']==1,'Sealed draw batches were rebuilt every frame')
        METRICS['batch10000Quads']=batch;page.close();return {'ide':stats,'batch':batch}
    case('forced rebuild CPU metrics and retained 10,000-quad batching',benchmark)
    browser.close()

summary={'passed':0,'failed':0,'skipped':0}
for result in RESULTS:
    is_skip=isinstance(result.get('details'),dict) and bool(result['details'].get('skipped'))
    summary['skipped' if is_skip else 'passed' if result['passed'] else 'failed']+=1
report={'summary':summary,'results':RESULTS,'metrics':METRICS,'visual':VISUAL,'claims':{
 'physicalHardwarePerformanceConfirmed':False,
 'fullWebGPUWithoutDOMPainting':False,
 'zeroPixelDifferenceInTestedIDEImages':bool(VISUAL) and all(v['changedPixels']==0 for v in VISUAL),
 'nativeVB6WindowsGoldenComparison':False,
 'note':'Native input/editing/icons and unsupported CSS remain DOM-rendered. CPU measurements and software GPU tests do not establish hardware speedup.'}}
(OUT/'report.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report['claims'],indent=2))
if URL: server.shutdown()
raise SystemExit(0 if all(result['passed'] for result in RESULTS) else 1)
