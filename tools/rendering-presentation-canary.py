"""Read-only diagnosis of browser presentation; never alters acceptance gates."""
import functools, http.server, io, json, platform, threading
from pathlib import Path
from PIL import Image
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'reports/presentation-canary';OUT.mkdir(parents=True,exist_ok=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args): pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=ROOT))
threading.Thread(target=server.serve_forever,daemon=True).start()
common=['--no-sandbox','--enable-unsafe-webgpu','--enable-unsafe-swiftshader','--use-angle=swiftshader','--use-vulkan=swiftshader','--enable-gpu','--ignore-gpu-blocklist','--enable-features=Vulkan']
profiles={
    'current':common+['--disable-partial-raster','--run-all-compositor-stages-before-draw','--use-webgpu-adapter=swiftshader','--disable-vulkan-surface','--disable-gpu-rasterization'],
    # Original independently reported headless recipe; no expected-image retry.
    # https://github.com/visgl/luma.gl/issues/2874
    'documented':common,
}
report={'platform':platform.platform(),'diagnosticOnly':True,'cases':[]}
try:
    with sync_playwright() as p:
        for profile,flags in profiles.items():
            for mode in ['full-headless','shell-headless','full-headed']:
                options={'headless':mode!='full-headed','args':flags,'ignore_default_args':['--hide-scrollbars']}
                if mode!='shell-headless':options['executable_path']=p.chromium.executable_path
                browser=None
                try:
                    browser=p.chromium.launch(**options)
                    for kind in ['raw','painter-flow','painter-fixed','painter-switched']:
                        entry={'profile':profile,'mode':mode,'kind':kind,'browser':browser.version,'flags':flags}
                        report['cases'].append(entry)
                        page=browser.new_page(viewport={'width':512,'height':256})
                        page.set_default_timeout(15000)
                        try:
                            page.goto(f'http://127.0.0.1:{server.server_port}/tests/fixtures/rendering.html')
                            page.add_script_tag(url=f'http://127.0.0.1:{server.server_port}/dist/vb6-rendering.js')
                            entry['draw']=page.evaluate('''async kind=>{
                              if(kind==='painter-switched')for(const backend of ['canvas2d','webgl2']){
                                const old=document.createElement('canvas');document.body.append(old);
                                const paint=await VB6Rendering.createPainter(backend,old);const scene=new VB6Rendering.PaintScene(128,128);scene.add([0,0,128,128],[0,1,0,1]);paint.render(scene);paint.dispose();old.remove();
                              }
                              const canvas=window.canaryCanvas=document.createElement('canvas');canvas.width=canvas.height=128;
                              canvas.style.cssText='display:block;width:128px;height:128px'+(kind==='painter-fixed'?';position:fixed;inset:0;contain:strict':'');document.body.append(canvas);
                              if(kind==='raw'){
                                const adapter=window.canaryAdapter=await navigator.gpu.requestAdapter();
                                const device=window.canaryDevice=await adapter.requestDevice();
                                const context=window.canaryContext=canvas.getContext('webgpu');context.configure({device,format:navigator.gpu.getPreferredCanvasFormat(),alphaMode:'premultiplied',usage:GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC});
                                window.canaryDraw=()=>{const encoder=device.createCommandEncoder();encoder.beginRenderPass({colorAttachments:[{view:context.getCurrentTexture().createView(),clearValue:[1,0,0,1],loadOp:'clear',storeOp:'store'}]}).end();device.queue.submit([encoder.finish()]);};
                              }else{
                                const painter=window.canaryPainter=await VB6Rendering.createPainter('webgpu',canvas);
                                const scene=window.canaryScene=new VB6Rendering.PaintScene(128,128);scene.add([0,0,128,128],[1,0,0,1]);window.canaryDraw=()=>painter.render(scene);
                              }
                              await new Promise((resolve,reject)=>requestAnimationFrame(()=>{try{canaryDraw();resolve();}catch(e){reject(e);}}));
                              await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
                              return {box:canvas.getBoundingClientRect().toJSON(),visible:document.visibilityState,adapter:(window.canaryDevice||window.canaryPainter.device).adapterInfo};
                            }''',kind)
                            image=page.screenshot(clip={'x':0,'y':0,'width':128,'height':128},caret='initial')
                            (OUT/f'{profile}-{mode}-{kind}.png').write_bytes(image)
                            colors=Image.open(io.BytesIO(image)).convert('RGB').getcolors(128*128)
                            entry['colors']=colors
                            entry['allRed']=colors==[(128*128,(255,0,0))]
                            entry['state']=page.evaluate('''()=>({canvas:[canaryCanvas.width,canaryCanvas.height],gpu:!!navigator.gpu,html:document.body.innerHTML})''')
                        except Exception as e:entry['error']=str(e)
                        finally:page.context.close()
                        print(json.dumps(entry),flush=True)
                except Exception as e:report['cases'].append({'profile':profile,'mode':mode,'launchError':str(e)})
                finally:
                    if browser:browser.close()
finally:
    (OUT/'report.json').write_text(json.dumps(report,indent=2));server.shutdown()
