#!/usr/bin/env python3
"""Exercise real IDE configuration, review, cancellation and downloaded archives."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import threading
import zipfile
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / 'reports/vbnet-migration'
REPORT.mkdir(parents=True, exist_ok=True)
BROWSER = os.environ.get('VB6_BROWSER', 'chromium')
INLINE = os.environ.get('VB6_OFFLINE') == '1'
if INLINE and os.environ.get('GITHUB_ACTIONS'):
    raise RuntimeError('Supplemental inline testing must not replace real CI origin tests')
fixture = json.loads(subprocess.check_output([
    'node', '--input-type=module', '-e',
    'import {formProject} from "./tests/migration-fixtures.mjs"; console.log(JSON.stringify({schema:1,id:"vbnet-browser-fixture",...formProject()}));'
], cwd=ROOT, text=True))

class Quiet(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass

server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Quiet, directory=str(ROOT)))
threading.Thread(target=server.serve_forever, daemon=True).start()
base = f'http://127.0.0.1:{server.server_port}'
results = []

def check(value, message):
    if not value:
        raise AssertionError(message)

def begin(page):
    page.locator('[data-menu="File"]').click()
    page.get_by_role('menuitem', name='Migrate to VB.NET (.NET 10 ZIP)…', exact=True).click()
    page.get_by_role('button', name='Analyze migration', exact=True).wait_for()

def analyze(page):
    page.get_by_role('button', name='Analyze migration', exact=True).click()
    page.wait_for_function('Boolean(vb6Studio.lastVbNetMigration?.converter)')

try:
    with sync_playwright() as p:
        launch = {'headless': True}
        if BROWSER == 'chromium':
            launch['args'] = ['--no-sandbox']
            if os.environ.get('CHROMIUM_PATH'):
                launch['executable_path'] = os.environ['CHROMIUM_PATH']
        browser = getattr(p, BROWSER).launch(**launch)
        context = browser.new_context(accept_downloads=True, viewport={'width': 1280, 'height': 900})
        page = context.new_page()
        page.set_default_timeout(30000)
        errors, downloads = [], []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.on('download', lambda download: downloads.append(download))
        if INLINE:
            page.set_content('<html><head></head><body><div id="studio"></div></body></html>')
            page.add_style_tag(content=(ROOT / 'dist/studio.css').read_text())
            page.add_script_tag(content=(ROOT / 'dist/studio.js').read_text())
        else:
            page.goto(base + '/dist/index.html')
        page.wait_for_function('Boolean(globalThis.vb6Studio?.vbNetExportInstalled)')
        page.evaluate('project => vb6Studio.loadProject(project)', fixture)
        expected = page.evaluate('vb6Studio.project')
        check(page.evaluate('typeof VB6Studio.StudioAPI.exportVbNetProject') == 'function', 'Public API not installed')
        begin(page)
        page.get_by_role('button', name='Cancel', exact=True).click()
        check(not downloads, 'Cancel downloaded an archive')
        results.append({'case': 'configuration-cancel', 'passed': True})
        begin(page)
        page.get_by_label('Migration platform', exact=True).select_option('x64')
        page.get_by_label('Migration code style', exact=True).select_option('compatibility')
        analyze(page)
        with page.expect_download() as event:
            page.get_by_role('button', name='Download .NET 10 ZIP', exact=True).click()
        download = event.value
        check(download.failure() is None, 'Download failed')
        archive = REPORT / 'ide-converted.zip'
        download.save_as(archive)
        with zipfile.ZipFile(archive) as z:
            report = json.loads(z.read('migration-report.json'))
            check(report['success'] and report['platform'] == 'x64', str(report['diagnostics']))
            check(report['validation']['dotnetBuild'] == 'not-run', 'Browser claimed to execute dotnet')
            check(json.loads(z.read('Originals/project.vb6web')) == expected, 'Snapshot changed')
            check('net10.0-windows' in z.read('Application/MigrationForms.vbproj').decode(), 'Wrong target')
            check('AddHandler' in z.read('Application/MainForm.Designer.vb').decode(), 'Events missing')
            check(z.testzip() is None, 'Archive CRC failed')
            check('VB6.Compatibility/src/VbArray.vb' in z.namelist(), 'Runtime source missing')
        results.append({'case': 'real-menu-configuration-download', 'passed': True, 'sha256': hashlib.sha256(archive.read_bytes()).hexdigest()})
        begin(page)
        check(page.get_by_label('Migration code style', exact=True).input_value() == 'native', 'Native-first is not the default')
        page.get_by_label('Migration runtime', exact=True).select_option('none')
        analyze(page)
        with page.expect_download() as event:
            page.get_by_role('button', name='Download .NET 10 ZIP', exact=True).click()
        lean = REPORT / 'ide-native.zip'
        event.value.save_as(lean)
        with zipfile.ZipFile(lean) as z:
            report = json.loads(z.read('migration-report.json'))
            check(report['success'] and report['runtime']['features'] == [], 'Simple form retained compatibility support')
            check(not any(p.startswith('VB6.Compatibility') or p.startswith('Application/Compatibility/') for p in z.namelist()), 'Runtime-free archive includes support')
            designer = z.read('Application/MainForm.Designer.vb').decode()
            check('Sub(sender As Object, e As EventArgs) RunButton_Click()' in designer and '__vbEvent' not in designer, 'Simple event adapters were not removed')
            check('ProjectReference' not in z.read('Application/MigrationForms.vbproj').decode(), 'Unused project reference remains')
        results.append({'case': 'native-runtime-free-menu-download', 'passed': True})
        page.evaluate('project => {vb6Studio.loadProject(project); vb6Studio.project.modules[0].code += "\\nPrivate Function Amount() As Currency\\nAmount=CCur(1.23456)\\nEnd Function";}', fixture)
        begin(page)
        page.get_by_label('Migration runtime', exact=True).select_option('none')
        check(not page.get_by_label('Approve Currency to Decimal', exact=True).is_checked(), 'Modernization was pre-approved')
        analyze(page)
        check(page.evaluate('vb6Studio.lastVbNetMigration.diagnostics.some(d => d.code === "MIG_RUNTIME_REQUIRED")'), 'Runtime-free mode silently removed required Currency support')
        page.get_by_role('button', name='Cancel', exact=True).click()
        results.append({'case': 'runtime-free-requirement-diagnostic', 'passed': True})
        begin(page)
        page.get_by_label('Migration runtime', exact=True).select_option('none')
        page.get_by_label('Approve Currency to Decimal', exact=True).check()
        analyze(page)
        with page.expect_download() as event:
            page.get_by_role('button', name='Download .NET 10 ZIP', exact=True).click()
        approved = REPORT / 'ide-approved-decimal.zip'
        event.value.save_as(approved)
        with zipfile.ZipFile(approved) as z:
            report = json.loads(z.read('migration-report.json'))
            check(report['success'] and report['semanticPolicy'] == 'modernize', 'Approved policy was not applied')
            check(report['modernization'] and report['runtime']['features'] == [], 'Modernization audit or elimination missing')
            check('As Decimal' in z.read('Application/MainForm.vb').decode(), 'Approved Decimal output missing')
        results.append({'case': 'explicit-decimal-approval-download', 'passed': True})
        begin(page)
        check(not page.get_by_label('Approve Currency to Decimal', exact=True).is_checked(), 'Approval leaked across exports')
        page.get_by_label('Migration runtime', exact=True).select_option('package')
        page.get_by_text('Shared package references (package policy only)', exact=True).click()
        page.get_by_label('Core runtime package ID', exact=True).fill('Company.Reviewed.Compatibility')
        page.get_by_label('Core runtime package version', exact=True).fill('0.2.0')
        analyze(page)
        with page.expect_download() as event:
            page.get_by_role('button', name='Download .NET 10 ZIP', exact=True).click()
        shared = REPORT / 'ide-package-reference.zip'
        event.value.save_as(shared)
        with zipfile.ZipFile(shared) as z:
            report = json.loads(z.read('migration-report.json'))
            check(report['success'] and report['runtime']['policy'] == 'package', 'Package policy missing')
            check('PackageReference Include="Company.Reviewed.Compatibility" Version="0.2.0"' in z.read('Application/MigrationForms.vbproj').decode(), 'Explicit package identity missing')
            check(any(d['code'] == 'MIG_RUNTIME_PACKAGE' for d in report['diagnostics']), 'Unverified-package warning missing')
        results.append({'case': 'explicit-package-reference-download', 'passed': True})
        page.evaluate('project => vb6Studio.loadProject(project)', fixture)
        begin(page)
        analyze(page)
        page.evaluate('vb6Studio.project.name = "ChangedWhileReviewing"')
        count = len(downloads)
        page.get_by_role('button', name='Download .NET 10 ZIP', exact=True).click()
        page.wait_for_timeout(100)
        check(len(downloads) == count, 'Stale project was exported')
        results.append({'case': 'stale-project-guard', 'passed': True})
        page.evaluate('project => {vb6Studio.loadProject(project); vb6Studio.project.modules[0].code += "\\nPrivate Sub Dangerous()\\nDebug.Print VarPtr(Me)\\nEnd Sub";}', fixture)
        begin(page)
        analyze(page)
        with page.expect_download() as event:
            page.get_by_role('button', name='Download unresolved review ZIP', exact=True).click()
        review = event.value
        review.save_as(REPORT / 'ide-review.zip')
        check(review.suggested_filename.endswith('-review.zip'), 'Unresolved archive not labeled')
        with zipfile.ZipFile(REPORT / 'ide-review.zip') as z:
            check(not json.loads(z.read('migration-report.json'))['success'], 'Errors reported success')
            check('<Error ' in z.read('Directory.Build.targets').decode(), 'Review bundle lacks build guard')
        results.append({'case': 'explicit-unresolved-review-download', 'passed': True})
        check(page.evaluate('()=>{const old=vb6Studio.runState;vb6Studio.runState="running";try{return vb6Studio.menu("File").find(x=>x?.id==="exportVbNet").enabled===false;}finally{vb6Studio.runState=old;}}'), 'Running state permits migration')
        results.append({'case': 'execution-state-guard', 'passed': True})
        check(not errors, '\n'.join(errors))
        context.close()
        browser.close()
except Exception as error:
    results.append({'case': 'execution', 'passed': False, 'error': str(error)})
    raise
finally:
    server.shutdown()
    (REPORT / 'browser-results.json').write_text(json.dumps({'browser': BROWSER, 'inline': INLINE, 'realHttpOrigin': not INLINE, 'results': results}, indent=2) + '\n')
print(json.dumps({'browser': BROWSER, 'passed': len(results)}))
