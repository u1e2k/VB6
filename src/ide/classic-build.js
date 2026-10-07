import {el, download} from '../core/core.js';
import {modal} from './ui.js';
import {writeZip} from '../project/zip.js';
import {prepareClassicProject} from '../exporter/classic-project.js';
import {exportClassicArchive} from '../exporter/classic-archive.js';
import {ClassicCompilerClient} from '../exporter/classic-client.js';

/** Independent of Win32 AOT. Host permission is scoped to one modal/session. */
export function installClassicExport(ide, api) {
  if (ide.classicExportInstalled) return;
  ide.classicExportInstalled = true;
  if (api) Object.assign(api, {prepareClassicProject, exportClassicArchive});
  const menu = ide.menu.bind(ide), command = ide.command.bind(ide);
  let opened = false;
  ide.menu = name => {
    const items = menu(name);
    if (name === 'File') {
      const index = items.findIndex(item => item?.id === 'exportWin32');
      items.splice(index < 0 ? items.length : index + 1, 0, {id: 'exportClassic', label: 'Make ' + ide.project.name + '.exe (Microsoft VB6 Runtime)…', icon: 'export', enabled: ide.runState === 'design' && !opened});
    }
    return items;
  };
  ide.command = async (id, ...args) => {
    if (id !== 'exportClassic') return command(id, ...args);
    if (opened || ide.runState !== 'design') {ide.status('Stop execution and close the current build dialog before exporting.'); return;}
    opened = true;
    const client = new ClassicCompilerClient(), cancelled = new AbortController();
    let alive = true, busy = false;
    const name = el('input', {type: 'text', value: ide.project.name, maxlength: 100, 'aria-label': 'Executable name'});
    const codegen = el('select', {'aria-label': 'Compilation mode'},
      el('option', {value: 'preserve'}, 'Preserve project setting'), el('option', {value: 'native'}, 'Microsoft native code'), el('option', {value: 'pcode'}, 'Microsoft P-code'));
    const endpoint = el('input', {type: 'url', value: 'http://127.0.0.1:8768/classic', 'aria-label': 'Compiler bridge URL', spellcheck: false});
    const token = el('input', {type: 'password', autocomplete: 'off', 'aria-label': 'Compiler bridge token', spellcheck: false});
    const output = el('pre', {role: 'status', 'aria-live': 'polite', tabindex: -1, style: {whiteSpace: 'pre-wrap', maxHeight: '120px', overflow: 'auto', margin: '8px 0'}});
    const downloads = el('div', {'data-classic-download': '', style: {overflowWrap: 'anywhere', marginBottom: '10px'}});
    let releaseDownload;
    const clearDownload = () => {releaseDownload?.(); releaseDownload = null; downloads.replaceChildren();};
    function offerArchive(name, bytes) {
      clearDownload();
      const doc = downloads.ownerDocument, view = doc.defaultView, urls = view.URL;
      const url = urls.createObjectURL(new view.Blob([bytes], {type: 'application/zip'}));
      // Keep a real, connected link inside the active (non-inert) modal. A click
      // is a request, not proof that the browser actually saved the file.
      const link = doc.createElement('a');
      link.href = url; link.download = name; link.tabIndex = 0; link.textContent = 'Save ZIP: ' + name;
      downloads.append(link, doc.createElement('br'), doc.createTextNode('No download? Click Save ZIP above. In an embedded preview, open the standalone IDE in its own browser tab.'));
      // Revoke only after the link is replaced/closed, allowing an in-flight save
      // to consume the blob. No expiring three-second link or detached anchor.
      releaseDownload = () => setTimeout(() => urls.revokeObjectURL(url), 60000);
      try {link.click();} catch (error) {downloads.append(doc.createTextNode(' Automatic download could not start: ' + error.message));}
    }
    const fields = [name, codegen, endpoint, token];
    const field = (caption, input) => el('label', {style: {display: 'grid', gridTemplateColumns: '145px minmax(0,1fr)', gap: '8px', marginBottom: '8px'}}, el('span', {}, caption), input);
    const content = el('div', {},
      el('p', {}, 'Build a genuine 32-bit Windows EXE using the Microsoft VB6 compiler and MSVBVM60.DLL. This is separate from Win32 AOT.'),
      output, downloads,
      field('Executable name', name), field('Compilation mode', codegen),
      el('fieldset', {}, el('legend', {}, 'Local Windows compiler (for EXE download)'), field('Bridge URL', endpoint), field('Session token', token),
        el('p', {}, 'On your Windows build machine: node tools/serve-classic.mjs ' + (globalThis.location?.origin === 'null' ? '--allow-file-origin' : '--origin ' + (globalThis.location?.origin || 'http://127.0.0.1:8080'))),
        el('p', {}, 'Paste its token, then approve the build in that terminal. A licensed VB6 compiler and the project’s 32-bit dependencies must already be installed. Tokens are discarded when this dialog closes.')),
      el('p', {}, 'Without a local compiler, download the build archive and compile it on a Windows machine. The archive always preserves the original project. Compatibility blockers are included in the ZIP; blocked archives must be corrected before compilation. It is not an EXE.'));
    const selected = () => ({name: name.value, codegen: codegen.value});
    function showPreflight() {
      try {
        const result = prepareClassicProject(ide.project, selected());
        output.textContent = result.manifest.warnings.join('\n') || 'Ready. No compiler, runtime DLL or OCX is bundled or installed.';
      } catch (error) {output.textContent = 'Build EXE unavailable: ' + error.message + '\nDownload Build Archive still saves the original project and reports these blockers.';}
    }
    for (const input of [name, codegen]) input.addEventListener('change', () => {clearDownload(); showPreflight();});
    showPreflight();
    async function perform(executable) {
      if (!alive || busy) return false;
      busy = true; clearDownload(); fields.forEach(input => input.disabled = true);
      try {
        if (ide.runState !== 'design') throw new Error('Stop execution before exporting.');
        const project = ide.project, snapshot = JSON.stringify(project), options = selected();
        output.textContent = executable ? 'Checking native source compatibility…' : 'Preparing project/build archive…';
        let result;
        if (executable) {
          const prepared = prepareClassicProject(JSON.parse(snapshot), options);
          output.textContent = (prepared.manifest.warnings.join('\n') + '\nConnecting to the local compiler. Approve this build in the Windows terminal…').trim();
          await client.connect(endpoint.value, token.value, {signal: cancelled.signal});
          token.value = ''; // No secrets remain in the DOM while compiling.
          result = await client.build(JSON.parse(snapshot), options, {signal: cancelled.signal});
        } else result = exportClassicArchive(JSON.parse(snapshot), options);
        cancelled.signal.throwIfAborted();
        if (!alive) return false;
        if (ide.project !== project || JSON.stringify(ide.project) !== snapshot || ide.runState !== 'design') throw new Error('Project changed during export. Build again to download the current project.');
        if (executable) {
          download(result.report.name + '.exe', result.bytes, 'application/vnd.microsoft.portable-executable');
          ide.lastClassicBuild = result.report; ide.emit('export', {kind: 'classic-vb6', report: result.report});
          ide.status('Made Microsoft VB6 runtime EXE — ' + result.bytes.length + ' bytes. Deploy MSVBVM60.DLL and the required 32-bit dependencies.');
        } else {
          const filename = result.manifest.name + '-vb6-build.zip', bytes = writeZip(result.files);
          offerArchive(filename, bytes);
          const readiness = result.manifest.buildable ? 'Native-source preflight passed; licensed compilation is still required.' :
            'Compilation blocked — the ZIP contains the exact project and diagnostics, not a buildable native application.\n' + result.manifest.diagnostics.map(item => item.message).join('\n');
          output.textContent = 'Archive prepared: ' + filename + ' (' + bytes.length + ' bytes). A download was requested.\n' + readiness;
          output.focus({preventScroll: true});
          ide.lastClassicBuild = result.manifest; ide.emit('export', {kind: 'classic-source', report: result.manifest});
          ide.status('Prepared ' + filename + (result.manifest.buildable ? '. Use Save ZIP to retry the download.' : '. Native compilation is blocked; see archive diagnostics.'));
          return false; // Keep the visible download/retry link and diagnostics available.
        }
        return true;
      } catch (error) {
        if (alive && !cancelled.signal.aborted) {
          output.textContent = error.message + (error.compilerLog ? '\n\nCompiler log:\n' + error.compilerLog : '');
          output.focus({preventScroll: true});
          ide.lastClassicBuild = {compiled: false, diagnostics: error.diagnostics || [{severity: 'error', message: error.message}]};
          ide.status('Microsoft VB6 export failed: ' + error.message);
        }
        return false;
      } finally {client.disconnect(); busy = false; if (alive) fields.forEach(input => input.disabled = false);}
    }
    try {
      await modal('Make Microsoft VB6 Runtime EXE', {width: 650, content,
        onReady: ({dialog, finish}) => {
          // The shared modal blocks footer actions while pending. Cancellation must
          // remain available even while the compiler awaits terminal approval.
          dialog.querySelector('.ide-dialog-footer button:last-child').addEventListener('click', event => {event.stopImmediatePropagation(); finish(false);}, {capture: true});
        },
        buttons: [{label: 'Build EXE', primary: true, action: () => perform(true)},
          {label: 'Download Build Archive', action: () => perform(false)}, {label: 'Cancel', value: false}]});
    } finally {alive = false; clearDownload(); cancelled.abort(); client.disconnect(); token.value = ''; opened = false;}
  };
}
