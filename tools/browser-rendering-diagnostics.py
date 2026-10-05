#!/usr/bin/env python3
"""Diagnostic only: distinguish native raster drift from GPU overlay paint.
The strict rendering suite remains the acceptance gate. No tolerance is relaxed.
"""
import functools
import http.server
import io
import json
import os
from pathlib import Path
import threading
from PIL import Image, ImageChops
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'reports/rendering/edge-diagnostics'
OUT.mkdir(parents=True, exist_ok=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args): pass
server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=ROOT))
threading.Thread(target=server.serve_forever, daemon=True).start()
def differences(first, second):
    a, b = [Image.open(io.BytesIO(data)).convert('RGB') for data in (first, second)]
    diff = ImageChops.difference(a, b)
    points = []
    box = diff.getbbox()
    if box:
        for y in range(box[1], box[3]):
            for x in range(box[0], box[2]):
                if a.getpixel((x,y)) != b.getpixel((x,y)):
                    if len(points) < 100:
                        points.append({'x':x,'y':y,'before':a.getpixel((x,y)),'after':b.getpixel((x,y))})
    return {'bounds':box, 'points':points}
try:
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH') or pw.chromium.executable_path, headless=False,
            args=['--no-sandbox','--enable-gpu','--ignore-gpu-blocklist','--enable-unsafe-webgpu','--enable-unsafe-swiftshader','--enable-features=Vulkan','--use-angle=swiftshader','--use-vulkan=swiftshader'])
        page = browser.new_page(viewport={'width':1280,'height':800}, device_scale_factor=1.5)
        page.goto(f'http://127.0.0.1:{server.server_port}/dist/VB6-Studio-Web.html')
        page.wait_for_function('window.vb6Studio?.rendering')
        page.evaluate('vb6Studio.rendering.ready')
        page.evaluate('vb6Studio.setRenderingPolicy({backend:"html"})')
        page.evaluate('async()=>{await document.fonts.ready;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))}')
        before = page.screenshot(); (OUT/'native-before.png').write_bytes(before)
        page.evaluate('vb6Studio.setRenderingPolicy({backend:"webgpu",fallbacks:["html"],text:"native"})')
        page.wait_for_timeout(150)
        active = page.evaluate('vb6Studio.rendering.getStats()')
        assert active['active'] == 'webgpu', active
        after = page.screenshot(); (OUT/'gpu-composited.png').write_bytes(after)
        diff = differences(before,after)
        samples = page.evaluate('''async points=>{
          const r=vb6Studio.rendering,scene=r.adapter.build(r.policy),image=await r.driver.render(scene,{readback:true});
          return points.map(point=>{
            const {x,y}=point, at=(y*image.width+x)*4,cx=(x+.5)/devicePixelRatio,cy=(y+.5)/devicePixelRatio;
            const commands=scene.commands.map((c,index)=>({...c,index,page:!!c.page})).filter(c=>cx>=c.rect[0]&&cy>=c.rect[1]&&cx<c.rect[0]+c.rect[2]&&cy<c.rect[1]+c.rect[3]&&cx>=c.clip[0]&&cy>=c.clip[1]&&cx<c.clip[0]+c.clip[2]&&cy<c.clip[1]+c.clip[3]);
            const nodes=document.elementsFromPoint(cx,cy).slice(0,8).map(n=>{
              const s=getComputedStyle(n),box=n.getBoundingClientRect();
              return {tag:n.tagName,id:n.id,class:n.className,text:n.textContent.slice(0,100),rect:[box.x,box.y,box.width,box.height],font:s.font,color:s.color,background:s.backgroundColor,decoration:s.textDecorationLine,transform:s.transform};
            });
            return {...point,overlay:Array.from(image.data.slice(at,at+4)),commands:commands.slice(-12),nodes};
          });
        }''',diff['points'])
        page.evaluate('vb6Studio.setRenderingPolicy({backend:"html"})')
        page.evaluate('async()=>{await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))}')
        restored = page.screenshot(); (OUT/'native-restored.png').write_bytes(restored)
        (OUT/'diagnostics.json').write_text(json.dumps({'browser':browser.version,'active':active,'difference':diff,'samples':samples,'nativeDrift':differences(before,restored)},indent=2))
        browser.close()
finally:
    server.shutdown()
