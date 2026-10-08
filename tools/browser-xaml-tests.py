#!/usr/bin/env python3
"""XAML IDE acceptance. HTTP is the default; local opaque-origin memory mode is
explicitly recorded and must not be presented as hosted/real-origin acceptance.
"""
import functools,http.server,json,os,shutil,subprocess,threading,time,unittest
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
ENGINE=os.environ.get('VB6_BROWSER','chromium')
MEMORY=os.environ.get('VB6_TEST_TRANSPORT')=='memory'
REPORT=ROOT/'reports'/'xaml'/ENGINE
FIXTURE=r'''enabled=>{const A=VB6StudioAPI,p=A.newProject('XamlTest'),m=p.modules[0];p.settings.xaml=enabled;p.settings.renderer='canvas2d';p.settings.snapToGrid=false;p.settings.anchoring=false;m.id='module';m.name='Form1';m.form.id='form';m.form.name='Form1';m.form.properties.Name='Form1';m.form.properties.Caption='XAML test';p.startup='Form1';
const button=A.createControl('CommandButton','Button1',300,300),text=A.createControl('TextBox','Text1',300,1000);button.id='button';text.id='text';button.properties.Caption='Original';text.properties.Text='Ready';m.form.controls=[button,text];m.code='Option Explicit\nPrivate Sub Button1_Click()\n Text1.Text = "Clicked"\nEnd Sub\n';vb6Studio.loadProject(p);return p;}'''
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
class XamlAcceptance(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        REPORT.mkdir(parents=True,exist_ok=True);cls.results=[]
        cls.server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT)))
        threading.Thread(target=cls.server.serve_forever,daemon=True).start();cls.base=f'http://127.0.0.1:{cls.server.server_port}'
        cls.pw=sync_playwright().start();options={'headless':True}
        if ENGINE=='chromium':
            options.update(executable_path=os.environ.get('CHROMIUM_PATH') or shutil.which('chromium'),args=['--no-sandbox'])
        cls.browser=getattr(cls.pw,ENGINE).launch(**options)
    @classmethod
    def tearDownClass(cls):
        cls.browser.close();cls.pw.stop();cls.server.shutdown();cls.server.server_close()
        (REPORT/'results.json').write_text(json.dumps({'browser':ENGINE,'transport':'memory' if MEMORY else 'http','results':cls.results},indent=2))
    def setUp(self):
        self.started=time.perf_counter();self.errors=[];self.passed=False
        self.context=self.browser.new_context(viewport={'width':1600,'height':1000});self.context.set_default_timeout(10000)
        self.page=self.context.new_page();self.page.on('pageerror',lambda error:self.errors.append(str(error)))
        if MEMORY:self.page.set_content((ROOT/'dist/VB6-Studio-Web.html').read_text())
        else:self.page.goto(self.base+'/dist/index.html')
        self.page.wait_for_function('globalThis.vb6Studio?.xaml');self.page.evaluate(FIXTURE,True)
    def tearDown(self):
        self.results.append({'name':self._testMethodName,'passed':self.passed and not self.errors,'pageErrors':self.errors,'milliseconds':round((time.perf_counter()-self.started)*1000,2)})
        self.context.close();self.assertEqual(self.errors,[])
    def done(self):self.passed=True
    def open(self):
        self.page.evaluate('vb6Studio.xaml.open()&&true');self.input=self.page.locator('.xaml-input');return self.input.input_value()
    def caption(self):return self.page.evaluate('vb6Studio.activeModule.form.controls.find(c=>c.id==="button").properties.Caption')
    def test_ime_composition_keeps_last_valid_form_until_commit(self):
        text=self.open()
        self.input.evaluate("el=>el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}))")
        self.input.evaluate("el=>{el.value='<vb:Form';el.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true}));}")
        self.assertEqual(self.caption(),'Original')
        self.assertEqual(self.page.evaluate('vb6Studio.activeModule.xaml===undefined'),True)
        self.input.evaluate("(el,text)=>{el.value=text;el.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}));}",text.replace('Caption="Original"','Caption="Zażółć 🦊"'))
        self.assertEqual(self.caption(),'Zażółć 🦊')
        revision=self.page.evaluate('vb6Studio.activeModule.xaml.revision')
        self.input.dispatch_event('input')
        self.assertEqual(self.page.evaluate('vb6Studio.activeModule.xaml.revision'),revision)
        self.done()
    def test_default_off_and_strict_boolean_gates(self):
        for value in [False,None,1,'true']:
            self.page.evaluate(FIXTURE,value)
            self.assertEqual(self.page.evaluate('vb6Studio.menu("View").some(i=>i?.id==="xamlView")'),False)
            self.assertIsNone(self.page.evaluate('vb6Studio.xaml.open()'))
            self.assertEqual(self.page.locator('.xaml-editor').count(),0)
        self.done()
    def test_options_cancel_then_apply_project_gate(self):
        self.page.evaluate(FIXTURE,False)
        for accept in [False,True]:
            self.page.evaluate('()=>{void vb6Studio.command("options");}')
            dialog=self.page.get_by_role('dialog',name='Options');dialog.get_by_role('tab',name='General',exact=True).click()
            dialog.get_by_role('checkbox',name='Enable XAML form authoring (this project)',exact=True).check()
            dialog.get_by_role('button',name='OK' if accept else 'Cancel',exact=True).click()
            self.assertEqual(self.page.evaluate('vb6Studio.project.settings.xaml===true'),accept)
            self.assertEqual(self.page.evaluate('vb6Studio.project.settings.anchoring'),False)
        self.open();self.assertEqual(self.page.locator('.xaml-editor').count(),1);self.done()
    def test_source_to_designer_and_properties(self):
        text=self.open();self.input.fill(text.replace('Caption="Original"','Caption="Edited in XAML"'))
        self.assertEqual(self.caption(),'Edited in XAML');self.page.evaluate('vb6Studio.designer.select(["button"])')
        self.assertEqual(self.page.locator('input[data-property="Caption"]').input_value(),'Edited in XAML')
        self.assertEqual(self.page.locator('.xaml-problems button').count(),0);self.done()
    def test_property_grid_to_source_preserves_comments_and_undo(self):
        text=self.open();self.input.fill(text.replace('<vb:CommandButton','<!-- preserve me -->\n  <vb:CommandButton'))
        self.page.evaluate('vb6Studio.designer.select(["button"])')
        prop=self.page.locator('input[data-property="Caption"]');prop.fill('Property edit');prop.press('Enter')
        self.assertEqual(self.caption(),'Property edit');self.assertIn('Caption="Property edit"',self.input.input_value());self.assertIn('<!-- preserve me -->',self.input.input_value())
        self.page.evaluate('vb6Studio.command("undo")');self.assertEqual(self.caption(),'Original');self.assertIn('Caption="Original"',self.input.input_value())
        self.page.evaluate('vb6Studio.command("redo")');self.assertEqual(self.caption(),'Property edit');self.done()
    def test_keyboard_designer_move_updates_source(self):
        self.open();self.page.evaluate('()=>{vb6Studio.designer.select(["button"]);vb6Studio.designer.root.focus();}')
        before=self.page.evaluate('vb6Studio.activeModule.form.controls[0].properties.Left');self.page.keyboard.press('ArrowRight')
        after=self.page.evaluate('vb6Studio.activeModule.form.controls[0].properties.Left');self.assertGreater(after,before)
        self.assertIn(f'Left="{after}"',self.input.input_value());self.done()
    def test_invalid_draft_is_retained_and_blocks_run(self):
        self.open();self.input.fill('<broken>')
        self.assertEqual(self.caption(),'Original');self.assertEqual(self.page.evaluate('vb6Studio.activeModule.xaml.text'),'<broken>')
        self.assertGreater(self.page.locator('.xaml-problems button').count(),0)
        self.page.evaluate('()=>{void vb6Studio.command("run");}')
        self.page.get_by_role('dialog',name='XAML',exact=True).get_by_role('button',name='OK',exact=True).click()
        self.assertEqual(self.page.evaluate('vb6Studio.runState'),'design');self.done()
    def test_conflict_recovery_is_explicit_and_undoable(self):
        self.open();self.input.fill('<broken>');self.page.evaluate('()=>{vb6Studio.designer.select(["button"]);vb6Studio.setProperty("Caption","Designer wins");}')
        self.assertEqual(self.input.input_value(),'<broken>');self.assertTrue(self.page.evaluate('vb6Studio.activeModule.xaml.conflict'))
        self.page.locator('[data-xaml-action="designer"]').click();self.page.get_by_role('dialog',name='Use Designer XAML').get_by_role('button',name='Use Designer',exact=True).click()
        self.assertIn('Caption="Designer wins"',self.input.input_value());self.assertEqual(self.page.evaluate('vb6Studio.activeModule.xaml.previousText'),'<broken>')
        self.page.evaluate('vb6Studio.command("undo")');self.assertEqual(self.input.input_value(),'<broken>');self.assertEqual(self.caption(),'Designer wins');self.done()
    def test_disable_removes_ui_without_discarding_source(self):
        text=self.open();self.input.fill(text+'<!-- retained -->')
        saved=self.page.evaluate('vb6Studio.activeModule.xaml.text')
        self.page.evaluate('()=>{const before=structuredClone(vb6Studio.project);vb6Studio.project.settings.xaml=false;vb6Studio.record(before,"Disable XAML");}')
        self.assertEqual(self.page.locator('.xaml-editor').count(),0);self.assertEqual(self.page.evaluate('vb6Studio.activeModule.xaml.text'),saved)
        self.assertFalse(self.page.evaluate('vb6Studio.menu("View").some(i=>i?.id==="xamlView")'));self.done()
    def test_document_reload_preserves_draft_and_valid_controls(self):
        self.open();self.input.fill('<invalid>');saved=self.page.evaluate('JSON.stringify(vb6Studio.project)')
        self.page.evaluate('saved=>vb6Studio.loadProject(JSON.parse(saved))',saved);self.assertEqual(self.open(),'<invalid>');self.assertEqual(self.caption(),'Original');self.done()
    def test_source_selection_updates_property_target(self):
        text=self.open();offset=text.index('Name="Button1"')+8
        self.input.evaluate('(e,n)=>{e.focus();e.setSelectionRange(n,n);e.dispatchEvent(new Event("select"));}',offset)
        self.assertEqual(self.page.evaluate('[...vb6Studio.designer.selection]'),['button']);self.assertEqual(self.page.get_by_label('Selected object',exact=True).input_value(),'button');self.done()
    def test_designer_selection_reveals_source_without_stealing_focus(self):
        self.open();self.page.evaluate('()=>{vb6Studio.designer.root.focus();vb6Studio.designer.select(["text"]);}')
        self.assertEqual(self.page.evaluate('document.activeElement===vb6Studio.designer.root'),True)
        selection=self.input.evaluate('e=>e.selectionStart');self.assertTrue(self.input.input_value()[selection:].startswith('<vb:TextBox'));self.done()
    def test_code_rename_and_shared_source_undo(self):
        text=self.open();self.input.fill(text.replace('Name="Button1"','Name="AcceptButton"'))
        self.assertIn('AcceptButton_Click',self.page.evaluate('vb6Studio.activeModule.code'))
        self.input.press('Control+z');self.assertIn('Button1_Click',self.page.evaluate('vb6Studio.activeModule.code'))
        self.assertEqual(self.caption(),'Original');self.input.press('Control+Shift+z');self.assertIn('AcceptButton_Click',self.page.evaluate('vb6Studio.activeModule.code'));self.done()
    def test_completion_hover_format_and_find(self):
        text=self.open();offset=text.index(' Caption="Original"')
        self.input.evaluate('(e,n)=>{e.focus();e.setSelectionRange(n,n);}',offset);self.input.press('Control+Space')
        self.assertGreater(self.page.locator('.xaml-completions [role="option"]').count(),0);self.input.press('Escape')
        self.input.evaluate('(e,n)=>e.setSelectionRange(n,n)',text.index('Caption="Original"')+2);self.input.press('Control+i')
        self.assertIn('Caption',self.page.locator('.xaml-info').inner_text())
        self.input.press('Control+f');self.page.get_by_label('Find in XAML',exact=True).fill('Original');self.page.get_by_label('Find in XAML',exact=True).press('Enter')
        self.assertEqual(self.input.evaluate('e=>e.value.slice(e.selectionStart,e.selectionEnd)'),'Original')
        self.page.locator('[data-xaml-action="format"]').click();self.assertEqual(self.caption(),'Original');self.done()
    def test_locked_form_and_running_project_are_read_only(self):
        self.open();self.page.evaluate('()=>{vb6Studio.designer.locked=true;vb6Studio.updateCommandState();}')
        self.assertTrue(self.input.evaluate('e=>e.readOnly'))
        self.page.evaluate('()=>{vb6Studio.designer.locked=false;vb6Studio.runState="running";vb6Studio.updateCommandState();}')
        self.assertTrue(self.input.evaluate('e=>e.readOnly'));self.done()
    def test_export_runs_existing_runtime_with_edited_controls_and_events(self):
        text=self.open();self.input.fill(text.replace('Caption="Original"','Caption="Exported XAML"'));project=self.page.evaluate('vb6Studio.project')
        code="import {exportApplication} from './src/exporter/exporter.js';import fs from 'node:fs';process.stdout.write(exportApplication(JSON.parse(fs.readFileSync(0,'utf8')),{persist:false}));"
        html=subprocess.run(['node','--input-type=module','-e',code],cwd=ROOT,input=json.dumps(project),text=True,capture_output=True,check=True).stdout
        self.assertNotIn('vb:Designer.Id',html);self.assertNotIn('XamlLanguageService',html)
        (REPORT/'export.html').write_text(html)
        if MEMORY:self.page.set_content(html)
        else:self.page.goto(self.base+f'/reports/xaml/{ENGINE}/export.html')
        self.page.wait_for_function('globalThis.vb6Application?.forms?.length===1')
        self.page.get_by_role('button',name='Exported XAML',exact=True).click()
        self.page.wait_for_function('vb6Application.forms[0].controls.find(c=>c.model.id==="text").Text==="Clicked"')
        self.page.screenshot(path=str(REPORT/'export.png'));self.done()
if __name__=='__main__':unittest.main(verbosity=2)
