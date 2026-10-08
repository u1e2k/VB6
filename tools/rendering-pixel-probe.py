#!/usr/bin/env python3
"""Run the unchanged strict suite, capturing the exact scene on visual failure."""
from pathlib import Path

original = Path(__file__).with_name('browser-rendering-tests.py')
source = original.read_text()
hook = """
                if comparison['changedPixels']:
                    from PIL import ImageChops
                    aa,bb=[Image.open(io.BytesIO(value)).convert('RGB') for value in (baseline,image)]
                    bounds=ImageChops.difference(aa,bb).getbbox()
                    points=[]
                    for yy in range(bounds[1],bounds[3]):
                        for xx in range(bounds[0],bounds[2]):
                            if aa.getpixel((xx,yy))!=bb.getpixel((xx,yy)) and len(points)<12:
                                points.append(dict(x=xx,y=yy,before=aa.getpixel((xx,yy)),after=bb.getpixel((xx,yy))))
                    detail=page.evaluate('''async points=>{
                      const r=vb6Studio.rendering,s=r.adapter.scene;
                      const result={stats:r.getStats(),points:points.map(point=>{
                        const cx=(point.x+.5)/devicePixelRatio,cy=(point.y+.5)/devicePixelRatio;
                        const commands=s.commands.map((c,index)=>({...c,index,page:!!c.page})).filter(c=>cx>=c.rect[0]&&cy>=c.rect[1]&&cx<c.rect[0]+c.rect[2]&&cy<c.rect[1]+c.rect[3]&&cx>=c.clip[0]&&cy>=c.clip[1]&&cx<c.clip[0]+c.clip[2]&&cy<c.clip[1]+c.clip[3]);
                        const nodes=document.elementsFromPoint(cx,cy).slice(0,4).map(n=>{
                          const style=getComputedStyle(n),box=n.getBoundingClientRect();
                          return {html:n.outerHTML.slice(0,1500),rect:[box.x,box.y,box.width,box.height],font:style.font,decoration:style.textDecorationLine};
                        });return {...point,commands:commands.slice(-12),nodes};})};
                      if(r.driver.device){const image=await r.driver.render(s,{readback:true});result.points.forEach(p=>{const offset=(p.y*image.width+p.x)*4;p.overlay=Array.from(image.data.slice(offset,offset+4));});}
                      return result;
                    }''',points)
                    trials={}
                    for name,style in [('pixelated','image-rendering:pixelated'),('expanded-holes',''),('hidden','visibility:hidden')]:
                        page.evaluate('''({name,style})=>{const r=vb6Studio.rendering,c=r.canvas;c.style.cssText+=';'+style;if(name==='expanded-holes'){const s=r.adapter.build(r.policy);for(const cmd of s.commands)if(cmd.hole)cmd.rect=[cmd.rect[0]-2,cmd.rect[1]-2,cmd.rect[2]+4,cmd.rect[3]+4];r.driver.render(s);}}''',dict(name=name,style=style))
                        page.wait_for_timeout(100)
                        capture=page.screenshot();(OUT/f'probe-{backend}-{dpr}-{name}.png').write_bytes(capture)
                        trials[name]=pixels(baseline,capture)
                    (OUT/f'probe-{backend}-{dpr}.json').write_text(json.dumps(dict(detail=detail,trials=trials),indent=2))
"""
marker="                check(comparison['changedPixels']==0,'IDE pixels differ: '+str(comparison))"
assert source.count(marker) == 1
source = source.replace(marker, hook + '\n' + marker)
# Instrumentation must not alter the gate, original file's path or exit status.
globals()['__file__'] = str(original)
exec(compile(source,str(original),'exec'),globals())
