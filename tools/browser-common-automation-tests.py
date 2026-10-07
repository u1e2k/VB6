"""Common COM-style HTTP/XML/ADO and configured data access in source and bundled runtimes."""
import functools
import http.server
import json
import os
import subprocess
from pathlib import Path
import threading
import time
import traceback
from playwright.sync_api import sync_playwright, expect
ROOT = Path(__file__).resolve().parents[1]
BROWSER = os.environ.get('VB6_BROWSER', 'chromium')
if BROWSER not in {'chromium','firefox','webkit'}:
    raise ValueError('Unknown browser')
class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass
    def reply(self, data, kind='application/json', status=200):
        self.send_response(status)
        self.send_header('Content-Type', kind)
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        try:
            self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError):
            pass
    def do_GET(self):
        if self.path == '/api/topstories.json':
            return self.reply(b'[101,102]')
        if self.path.startswith('/api/item/'):
            number=self.path.rsplit('/',1)[1].split('.')[0]
            return self.reply(json.dumps({'title':'Story '+number,'score':100,'by':'author'}).encode())
        if self.path.startswith('/api/binding/'):
            number=self.path.rsplit('/',1)[1].split('.')[0]
            return self.reply(json.dumps([{'id':1,'title':'First '+number},{'id':2,'title':'Second '+number}]).encode())
        if self.path == '/api/text':
            return self.reply('Żółć'.encode(), 'text/plain; charset=utf-8')
        if self.path == '/api/document.xml':
            return self.reply(b'<news><title>XML story</title></news>', 'application/xml')
        if self.path == '/api/slow':
            time.sleep(0.2)
            return self.reply(b'{}')
        return super().do_GET()
    def do_POST(self):
        count=int(self.headers.get('Content-Length','0'))
        if self.path!='/api/echo' or count>4*1024*1024:
            return self.reply(b'{}',status=400)
        self.reply(self.rfile.read(count),'application/xml')
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Handler,directory=str(ROOT)))
thread=threading.Thread(target=server.serve_forever,daemon=True)
thread.start()
base=f'http://127.0.0.1:{server.server_port}'
report={'browser':BROWSER,'status':'failed','modes':{},'binding':{}}
try:
    subprocess.run(['node',str(ROOT/'tools/common-bound-exports.mjs'),base],cwd=ROOT,check=True)
    with sync_playwright() as p:
        launch={'headless':True}
        if BROWSER=='chromium' and os.environ.get('CHROMIUM_PATH'):
            launch['executable_path']=os.environ['CHROMIUM_PATH']
        browser=getattr(p,BROWSER).launch(**launch)
        try:
            for mode in ['esm','bundle']:
                page=browser.new_page()
                errors=[]
                page.on('pageerror',lambda e:errors.append(str(e)))
                try:
                    page.goto(base+'/tests/fixtures/com-ole-browser.html')
                    if mode=='bundle':
                        page.add_script_tag(url='/dist/vb6-runtime.js')
                    checks=page.evaluate('''async ({mode,base})=>{
                        const api=mode==='esm'?(await import('/src/runtime/entry.js')).RuntimeAPI:globalThis.VB6Runtime.RuntimeAPI;
                        return await (await import('/tests/fixtures/common-automation-browser.js')).validateCommonAutomationBrowser(api,base);
                    }''',{'mode':mode,'base':base})
                    assert len(checks)==9,checks
                    assert not errors,errors
                    report['modes'][mode]=checks
                finally:
                    page.close()
            for mode in ['host','inline','modular']:
                page=browser.new_page()
                errors=[]
                page.on('pageerror',lambda e:errors.append(str(e)))
                try:
                    if mode=='host':
                        page.goto(base+'/tests/fixtures/com-ole-browser.html')
                        page.evaluate("""async base=>{
                          const api=(await import('/src/runtime/entry.js')).RuntimeAPI;
                          const project=await (await fetch('/reports/com-ole/exports/project.json')).json();
                          const target=document.createElement('div');target.style.cssText='position:absolute;inset:0';document.body.append(target);
                          const host=new api.ApplicationHost(project,target,{persist:false});
                          globalThis.vb6Application=host;await host.start();
                        }""",base)
                    else:
                        page.goto(base+'/reports/com-ole/exports/'+('inline.html' if mode=='inline' else 'modular/index.html'))
                    page.wait_for_function("globalThis.vb6Application?.forms[0]?.controlMap.get('title1').Text==='First 1'")
                    page.evaluate("globalThis.originalCommonRecordset=vb6Application.forms[0].controlMap.get('grid1')._boundRS")
                    assert page.evaluate("vb6Application.forms[0].controlMap.get('grid1').Rows")==3
                    expect(page.locator('[data-control="Title1"] input')).to_have_value('First 1')
                    page.locator('[data-control="cmdNext"]').click()
                    page.wait_for_function("vb6Application.forms[0].controlMap.get('title1').Text==='Second 1'")
                    page.locator('[data-control="cmdRefresh"]').click()
                    page.wait_for_function("vb6Application.forms[0].controlMap.get('title1').Text==='First 2'")
                    assert page.evaluate("vb6Application.forms[0].controlMap.get('grid1')._boundRS===originalCommonRecordset")
                    assert page.evaluate("vb6Application.forms[0].controlMap.get('grid1').TextMatrix(1,1)")=='First 2'
                    assert page.evaluate("vb6Application.forms[0].controlMap.get('title1')._boundRS===originalCommonRecordset")
                    assert not errors,errors
                    report['binding'][mode]=['saved REST definitions execute','grid and textbox share recordset','button navigation updates field','refresh preserves bound identity','refreshed grid values visible']
                    page.evaluate("vb6Application.dispose()")
                finally:
                    page.close()
        finally:
            browser.close()
    report['status']='passed'
except Exception:
    report['error']=traceback.format_exc()
    raise
finally:
    server.shutdown();server.server_close();thread.join(timeout=5)
    output=ROOT/'reports'/'com-ole'/BROWSER
    output.mkdir(parents=True,exist_ok=True)
    (output/'common-automation.json').write_text(json.dumps(report,indent=2)+'\n')
    print(json.dumps(report,indent=2))
