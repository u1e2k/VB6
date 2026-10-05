"""Isolate native mnemonic compositing without weakening the acceptance suite."""
import functools, http.server, io, json, os, threading
from pathlib import Path
from PIL import Image, ImageChops
from playwright.sync_api import sync_playwright
ROOT=Path.cwd();OUT=ROOT/'reports/native-edge-probe';OUT.mkdir(parents=True,exist_ok=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
 def log_message(self,*args): pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=ROOT))
threading.Thread(target=server.serve_forever,daemon=True).start()
def diff(a,b):
 a,b=[Image.open(io.BytesIO(x)).convert('RGB') for x in (a,b)];delta=ImageChops.difference(a,b);box=delta.getbbox();n=0;points=[]
 if box:
  for y in range(box[1],box[3]):
   for x in range(box[0],box[2]):
    if a.getpixel((x,y))!=b.getpixel((x,y)):
     n+=1
     if len(points)<8:points.append([x,y,a.getpixel((x,y)),b.getpixel((x,y))])
 return {'count':n,'bounds':box,'points':points}
variants=[('native-control','',None),('painted-underline','u{text-decoration-line:none!important;background-image:linear-gradient(currentColor,currentColor);background-size:100% 1px;background-position:left bottom 1px;background-repeat:no-repeat}',None),('native-repeat','',None),('painted-repeat','u{text-decoration-line:none!important;background-image:linear-gradient(currentColor,currentColor);background-size:100% 1px;background-position:left bottom 1px;background-repeat:no-repeat}',None)]
results=[]
try:
 with sync_playwright() as pw:
  browser=pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or pw.chromium.executable_path,headless=False,args=['--no-sandbox','--enable-gpu','--ignore-gpu-blocklist','--enable-unsafe-webgpu','--enable-unsafe-swiftshader','--enable-features=Vulkan','--use-angle=swiftshader','--use-vulkan=swiftshader'])
  for name,css,kind in variants:
   page=browser.new_page(viewport={'width':1280,'height':800},device_scale_factor=1.5)
   page.goto(f'http://127.0.0.1:{server.server_port}/dist/VB6-Studio-Web.html');page.wait_for_function('window.vb6Studio?.rendering');page.evaluate('vb6Studio.rendering.ready')
   page.evaluate('vb6Studio.setRenderingPolicy({backend:"html"})')
   if css:page.add_style_tag(content=css)
   page.evaluate('async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))}');page.wait_for_timeout(100)
   baseline=page.screenshot();(OUT/f'{name}-html.png').write_bytes(baseline)
   info=page.evaluate('''()=>{const n=[...document.querySelectorAll('.vb-label u')].find(n=>n.parentElement.textContent==='Order number:');const s=getComputedStyle(n);return {rect:n.getBoundingClientRect().toJSON(),decoration:s.textDecoration,skip:s.textDecorationSkipInk,offset:s.textUnderlineOffset,font:s.font};}''')
   for backend in ['canvas2d','webgpu']:
    for repeat in range(4):
     page.evaluate('vb6Studio.setRenderingPolicy({backend:"html"})');page.wait_for_timeout(100)
     nativeBefore=page.screenshot()
     page.evaluate('b=>vb6Studio.setRenderingPolicy({backend:b,fallbacks:["html"],text:"native"})',backend);page.wait_for_timeout(150)
     check=page.evaluate('vb6Studio.rendering.backend');assert check==backend,check
     composed=page.screenshot();compare=diff(nativeBefore,composed)
     (OUT/f'{name}-{backend}-{repeat}.png').write_bytes(composed)
     page.evaluate('vb6Studio.rendering.canvas.style.visibility="hidden"');page.wait_for_timeout(100)
     hidden=page.screenshot()
     entry={'variant':name,'backend':backend,'repeat':repeat,'info':info,'difference':compare,'hidden':diff(nativeBefore,hidden),'baselineDrift':diff(baseline,nativeBefore)}
     results.append(entry);print(json.dumps(entry),flush=True)
   page.context.close()
  browser.close()
finally:
 (OUT/'report.json').write_text(json.dumps(results,indent=2));server.shutdown()
