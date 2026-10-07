"""Common COM-style HTTP/XML/ADO and configured data access in source and bundled runtimes."""
import functools
import http.server
import json
import os
from pathlib import Path
import threading
import time
import traceback
from playwright.sync_api import sync_playwright
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
report={'browser':BROWSER,'status':'failed','modes':{}}
try:
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
