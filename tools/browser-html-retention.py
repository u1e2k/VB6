#!/usr/bin/env python3
"""Real-browser HTML retention/layout regressions; no network or GPU required.

Optional --baseline accepts a previously built standalone IDE to collect paired
CPU observations and exact screenshot evidence. It is not a hardware guarantee.
"""
from __future__ import annotations
import argparse, io, json, os, platform, shutil, subprocess, time, traceback
from pathlib import Path
from PIL import Image, ImageChops
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
parser=argparse.ArgumentParser()
parser.add_argument('--baseline',type=Path)
parser.add_argument('--browser',choices=['chromium','firefox','webkit'],default='chromium')
args=parser.parse_args()
OUT=ROOT/'reports/html-retention';OUT.mkdir(parents=True,exist_ok=True)
CSS=(ROOT/'dist/studio.css').read_text()
HTML=(ROOT/'dist/VB6-Studio-Web.html').read_text()
BUNDLE=subprocess.check_output(['node','--input-type=module','-e',
 "import {bundle} from './tools/bundle.mjs'; console.log(bundle('tests/fixtures/html-retention.js','RetentionTest'));"],cwd=ROOT,text=True)
RESULTS=[];METRICS={};ERRORS=[]

def check(ok,message):
    if not ok: raise AssertionError(message)

def case(name,fn):
    start=time.perf_counter()
    try:
        detail=fn();RESULTS.append({'name':name,'passed':True,'details':detail,'ms':(time.perf_counter()-start)*1000});print('PASS',name,flush=True)
    except Exception as error:
        RESULTS.append({'name':name,'passed':False,'error':str(error)});traceback.print_exc(limit=3)
        print('FAIL',name,str(error),flush=True)
    finally:
        for context in list(browser.contexts): context.close()

def page_for(html=None,dpr=1):
    page=browser.new_page(viewport={'width':1280,'height':800},device_scale_factor=dpr)
    page.set_default_timeout(8000)
    page.on('pageerror',lambda error:ERRORS.append(str(error)))
    page.set_content(html or '<!doctype html><meta charset="utf-8"><style>'+CSS+'</style><body></body>')
    if html is None: page.add_script_tag(content=BUNDLE)
    else:
        page.wait_for_function('window.vb6Studio')
        page.evaluate('async()=>{await vb6Studio.setRenderingPolicy?.({backend:"html"});}')
    return page

PROJECT_JS='''()=>{const a=VB6StudioAPI,p=a.newProject('RenderingRegression'),f=p.modules[0];p.settings.renderer='canvas2d';p.settings.showGrid=false;for(let i=0;i<60;i++){const c=a.createControl('CommandButton','Button'+i,150+(i%10)*750,150+Math.floor(i/10)*550);Object.assign(c.properties,{Width:660,Height:330,Caption:'&Test '+i});f.form.controls.push(c)}vb6Studio.loadProject(p);vb6Studio.designer.select(f.form.controls.map(c=>c.id));vb6Studio.status('Ready');return f.form.controls.length}'''

with sync_playwright() as p:
    engine=getattr(p,args.browser)
    executable=(os.environ.get('CHROMIUM_PATH') or shutil.which('chromium') or engine.executable_path) if args.browser=='chromium' else engine.executable_path
    browser=engine.launch(executable_path=executable,headless=True,args=['--no-sandbox'] if args.browser=='chromium' else [])
    METRICS.update(browser=browser.version,platform=platform.platform(),physicalGpuPerformanceConfirmed=False,baselineSha=os.environ.get('HTML_BASELINE_SHA'),sourceSha=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip())

    def list_retention():
        page=page_for()
        result=page.evaluate('''()=>{const l=new RetentionTest.ToolList('Large list');Object.assign(l.root.style,{width:'400px',height:'190px',position:'relative',overflow:'auto'});document.body.append(l.root);l.set(Array.from({length:50000},(_,i)=>({key:'k'+i,label:'Item '+i,glyph:'▣'})));const nodes=[...l.layer.children],created=l.paintStats.created;const m=new MutationObserver(()=>{});m.observe(l.root,{subtree:true,attributes:true,childList:true,characterData:true});const t=performance.now();for(let i=0;i<200;i++)l.paint();const ms=performance.now()-t,mutations=m.takeRecords().length;const stable=nodes.every((n,i)=>n===l.layer.children[i]);l.select(2);const selectionStable=nodes.every((n,i)=>n===l.layer.children[i]);const selected=l.root.getAttribute('aria-activedescendant')===l.layer.children[2].id;l.items[2].label='Changed';l.paint();const changed=l.layer.children[2].textContent==='Changed';l.select(49999);const end=l.layer.querySelector('[aria-selected="true"]')?.textContent,rows=l.layer.children.length;const bounded=l.rowNodes.size===rows&&rows<30;l.root.setAttribute('aria-label','');l.paint();const labelFallback=l.root.getAttribute('aria-label')==='Items';l.dispose();m.disconnect();return {mutations,stable,selectionStable,selected,changed,end,rows,bounded,labelFallback,initialRows:nodes.length,unchangedPaints:200,unchangedCpuMs:ms,initialCreated:created,createdAfterScroll:l.paintStats.created}}''')
        check(result['mutations']==0,'Unchanged paints mutated live DOM: '+str(result))
        for field in ['stable','selectionStable','selected','changed','bounded','labelFallback']:check(result[field],field+': '+str(result))
        check(result['end']=='Item 49999','End selection was lost')
        METRICS['virtualList']=result;return result
    case('50,000-row list retains visible DOM and performs zero unchanged mutations',list_retention)

    def caption_options():
        page=page_for()
        result=page.evaluate('''()=>{const {BrowserControl,createControl}=RetentionTest;const results=[];for(const type of ['CommandButton','Label','Frame','CheckBox','OptionButton']){const model=createControl(type);model.properties.Caption='&Open && Save';const c=new BrowserControl(model,{design:true,backend:'canvas2d'});document.body.append(c.node);const label=c.legend||c.label||c.node,children=[...label.childNodes];for(let i=0;i<40;i++)c.refresh();const stable=children.every((n,i)=>n===label.childNodes[i])&&children.length===label.childNodes.length;c.props.Caption='&Close';c.refresh();results.push({type,stable,changed:label.textContent==='Close',underlined:label.querySelector('u')?.textContent==='C'});c.dispose()}const m=createControl('ListBox');m.properties.List=['A','B','C'];m.properties.ListIndex=1;const l=new BrowserControl(m,{backend:'canvas2d'});document.body.append(l.node);const options=[...l.input.options];l.itemsRevision=10;l.refresh();const stable=options.every((n,i)=>n===l.input.options[i]);l.props.ListIndex=2;l.refresh();const selected=l.input.selectedIndex;l.items[1]='Changed';l.itemsRevision++;l.refresh();const changed=l.input.options[1].textContent;l.dispose();return {captions:results,options:{stable,selected,changed}}}''')
        check(all(x['stable'] and x['changed'] and x['underlined'] for x in result['captions']),str(result))
        check(result['options']=={'stable':True,'selected':2,'changed':'Changed'},str(result))
        return result
    case('control captions, mnemonics and native option selections retain identity',caption_options)

    def designer_batching():
        page=page_for()
        result=page.evaluate('''()=>{const {FormDesigner,newProject,createControl}=RetentionTest;const project=newProject(),module=project.modules[0];project.settings.renderer='canvas2d';project.settings.showGrid=false;for(let i=0;i<60;i++){const c=createControl('CommandButton','Button'+i,150+(i%10)*750,150+Math.floor(i/10)*550);c.properties.Width=660;module.form.controls.push(c)}const host=document.createElement('div');document.body.append(host);const d=new FormDesigner(host);d.setDocument(module,project);d.select(module.form.controls.map(c=>c.id));d.showTabOrder=true;const m=new MutationObserver(()=>{});m.observe(d.overlay,{subtree:true,childList:true});const original=Element.prototype.getBoundingClientRect;let interleaved=0,reads=0,parentReads=0;Element.prototype.getBoundingClientRect=function(){reads++;if(this===d.formView.content)parentReads++;if(m.takeRecords().length)interleaved++;return original.call(this)};try{d.renderSelection()}finally{Element.prototype.getBoundingClientRect=original;m.disconnect()}const outlines=d.overlay.querySelectorAll('.selection-outline').length,markers=d.overlay.querySelectorAll('.tab-order-marker').length;d.showTabOrder=false;d.select([]);const handles=d.formSelection.children.length;d.dispose();return {reads,parentReads,interleaved,outlines,markers,handles}}''')
        check(result=={'reads':61,'parentReads':1,'interleaved':0,'outlines':60,'markers':60,'handles':8},str(result))
        return result
    case('designer batches 60 selections and tab markers before overlay writes',designer_batching)

    def selected_refresh():
        page=page_for()
        result=page.evaluate("""()=>{const {FormDesigner,newProject,createControl}=RetentionTest,p=newProject(),m=p.modules[0];p.settings.renderer='canvas2d';p.settings.showGrid=false;for(let i=0;i<10;i++)m.form.controls.push(createControl('CommandButton','Button'+i,150+i*700,150));const host=document.createElement('div');document.body.append(host);const d=new FormDesigner(host);d.setDocument(m,p);d.select([m.form.controls[3].id]);const before=m.form.controls[3].properties.Left,counts=Array(10).fill(0);d.formView.controls.forEach((v,i)=>{const original=v.refresh;v.refresh=function(){counts[i]++;return original.call(this)}});d.keydown(new KeyboardEvent('keydown',{key:'ArrowRight'}));const selectedOnly=counts[3]===1&&counts.filter((_,i)=>i!==3).every(n=>n===0),moved=m.form.controls[3].properties.Left===before+p.settings.gridSize,updated=d.formView.controls[3].props.Left===m.form.controls[3].properties.Left;counts.fill(0);d.refreshControlPositions();const general=counts.every(n=>n===1);d.dispose();return {selectedOnly,moved,updated,general}}""")
        check(all(result.values()),str(result));return result
    case('keyboard movement refreshes selected controls and preserves full refresh API',selected_refresh)

    def capture_stable(page,name):
        # Wait for the fixture's fonts, ResizeObserver callbacks and canvas RAFs,
        # rather than assuming an arbitrary 100 ms includes their presentation.
        # This never retries until two DIFFERENT builds happen to match: each
        # build must independently produce three identical consecutive frames.
        page.bring_to_front()
        page.evaluate("""async()=>{await document.fonts.ready;const d=vb6Studio.designer;let stable=0;for(let i=0;i<120;i++){await new Promise(requestAnimationFrame);if(!d.selectionFrame&&!d.grid?.dirty&&!d.grid?.resizeFrame&&!d.formView?.surface?.dirty)stable++;else stable=0;if(stable>=3)return;}throw Error('Designer did not settle')}""")
        frames=[];stable=0;last=None
        for index in range(12):
            data=page.screenshot(animations='disabled')
            rgb=Image.open(io.BytesIO(data)).convert('RGB')
            changed=None if last is None else sum(any(pixel) for pixel in ImageChops.difference(last,rgb).getdata())
            frames.append({'capture':index,'changedFromPrevious':changed})
            stable=stable+1 if changed==0 else 0
            if stable>=2:
                (OUT/(name+'.png')).write_bytes(data)
                METRICS.setdefault('captureStability',{})[name]=frames
                return data
            last=rgb;page.wait_for_timeout(50)
        METRICS.setdefault('captureStability',{})[name]=frames
        (OUT/(name+'.png')).write_bytes(data)
        raise AssertionError('Presentation did not stabilize: '+name)

    for dpr in [1,1.25,1.5,2]:
        def visual(dpr=dpr):
            page=page_for(HTML,dpr);page.evaluate(PROJECT_JS)
            image=capture_stable(page,f'html-selected-{dpr}');result={'dpr':dpr,'controls':60}
            if args.baseline:
                previous=page_for(args.baseline.read_text(),dpr);previous.evaluate(PROJECT_JS)
                baseline=capture_stable(previous,f'baseline-selected-{dpr}')
                # A second independent baseline detects browser nondeterminism;
                # it is evidence, not a tolerance or replacement golden image.
                repeat=page_for(args.baseline.read_text(),dpr);repeat.evaluate(PROJECT_JS)
                repeated=capture_stable(repeat,f'baseline-repeat-{dpr}')
                a,b,c=[Image.open(io.BytesIO(data)).convert('RGB') for data in [image,baseline,repeated]]
                check(a.size==b.size==c.size,'Screenshot dimensions differ')
                self_changed=sum(any(pixel) for pixel in ImageChops.difference(b,c).getdata())
                changed=sum(any(pixel) for pixel in ImageChops.difference(a,b).getdata())
                result.update(changedPixels=changed,baselineRepeatChangedPixels=self_changed)
                METRICS.setdefault('visualComparisons',[]).append(result)
                check(self_changed==0,'Baseline is nondeterministic: '+str(result))
                check(changed==0,'HTML pixels changed: '+str(result))
            return result
        case(f'HTML designer selection visual evidence at DPR {dpr}',visual)

    def paired_cpu():
        results={}
        for name,html in [('current',HTML)]+([('baseline',args.baseline.read_text())] if args.baseline else []):
            page=page_for(html);page.evaluate(PROJECT_JS)
            results[name]=page.evaluate('''()=>{const d=vb6Studio.designer;for(let i=0;i<5;i++)d.renderSelection();const times=[];for(let i=0;i<40;i++){const t=performance.now();d.renderSelection();times.push(performance.now()-t)}times.sort((a,b)=>a-b);return {controls:60,iterations:40,cpuP50Ms:times[20],cpuP95Ms:times[38]}}''')
            page.context.close()
        METRICS['designerSelectionCpu']=results;return results
    case('same-session designer CPU observations (not a universal performance gate)',paired_cpu)
    case('no browser script errors',lambda:check(not ERRORS,str(ERRORS)))
    browser.close()
report={'results':RESULTS,'metrics':METRICS,'summary':{'passed':sum(r['passed'] for r in RESULTS),'failed':sum(not r['passed'] for r in RESULTS)},'scope':'HTML DOM/layout behavior and optional same-browser pixel reference; not native VB6 or physical GPU certification.'}
(OUT/'report.json').write_text(json.dumps(report,indent=2));print(json.dumps(report['summary']))
raise SystemExit(0 if all(r['passed'] for r in RESULTS) else 1)
