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
    const output = el('pre', {role: 'status', 'aria-live': 'polite', style: {whiteSpace: 'pre-wrap', maxHeight: '180px', overflow: 'auto', margin: '8px 0'}});
    const fields = [name, codegen, endpoint, token];
    const field = (caption, input) => el('label', {style: {display: 'grid', gridTemplateColumns: '145px minmax(0,1fr)', gap: '8px', marginBottom: '8px'}}, el('span', {}, caption), input);
    const content = el('div', {},
      el('p', {}, 'Build a genuine 32-bit Windows EXE using the Microsoft VB6 compiler and MSVBVM60.DLL. This is separate from Win32 AOT.'),
      field('Executable name', name), field('Compilation mode', codegen),
      el('fieldset', {}, el('legend', {}, 'Local Windows compiler (for EXE download)'), field('Bridge URL', endpoint), field('Session token', token),
        el('p', {}, 'On your Windows build machine: node tools/serve-classic.mjs ' + (globalThis.location?.origin === 'null' ? '--allow-file-origin' : '--origin ' + (globalThis.location?.origin || 'http://127.0.0.1:8080'))),
        el('p', {}, 'Paste its token, then approve the build in that terminal. A licensed VB6 compiler and the project’s 32-bit dependencies must already be installed. Tokens are discarded when this dialog closes.')),
      el('p', {}, 'Without a local compiler, download the build archive and compile it on a Windows machine. The archive contains source and a standalone build script, not an EXE.'), output);
    const selected = () => ({name: name.value, codegen: codegen.value});
    function showPreflight() {
      try {
        const result = prepareClassicProject(ide.project, selected());
        output.textContent = result.manifest.warnings.join('\n') || 'Ready. No compiler, runtime DLL or OCX is bundled or installed.';
      } catch (error) {output.textContent = error.message;}
    }
    for (const input of [name, codegen]) input.addEventListener('change', showPreflight);
    showPreflight();
    async function perform(executable) {
      if (!alive || busy) return false;
      busy = true; fields.forEach(input => input.disabled = true);
      try {
        if (ide.runState !== 'design') throw new Error('Stop execution before exporting.');
        const project = ide.project, snapshot = JSON.stringify(project), options = selected();
        const prepared = prepareClassicProject(JSON.parse(snapshot), options);
        output.textContent = (prepared.manifest.warnings.join('\n') + '\n' + (executable ? 'Connecting to the local compiler. Approve this build in the Windows terminal…' : 'Preparing native source archive…')).trim();
        let result;
        if (executable) {
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
          download(result.manifest.name + '-vb6-build.zip', writeZip(result.files), 'application/zip');
          ide.lastClassicBuild = result.manifest; ide.emit('export', {kind: 'classic-source', report: result.manifest});
          ide.status('Made Microsoft VB6 build archive. Compile it with licensed VB6 on Windows to produce the EXE.');
        }
        return true;
      } catch (error) {
        if (alive && !cancelled.signal.aborted) {
          output.textContent = error.message + (error.compilerLog ? '\n\nCompiler log:\n' + error.compilerLog : '');
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
    } finally {alive = false; cancelled.abort(); client.disconnect(); token.value = ''; opened = false;}
  };
}
