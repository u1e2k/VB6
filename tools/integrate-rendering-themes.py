"""One-time, exact-tree integration of reviewed main and renderer sources.

Removed by its own successful source commit. It cannot update expectations,
force a ref, merge a PR, or publish a tree other than the locally tested tree.
"""
import json
import re
import subprocess
from pathlib import Path

ROOT = Path.cwd()
OUT = Path('/tmp/rendering-theme-integration')
OUT.mkdir(parents=True, exist_ok=True)
def git(*args):
    return subprocess.check_output(['git', *args], text=True).strip()

def replace_conflicts(path, resolve, expected):
    target = ROOT / path
    text = target.read_text()
    count = 0
    def replacement(match):
        nonlocal count
        value = resolve(match[1], match[2], count)
        count += 1
        return value
    text = re.sub(r'<<<<<<< HEAD\n(.*?)=======\n(.*?)>>>>>>> [^\n]+\n', replacement, text, flags=re.S)
    assert count == expected, (path, count)
    target.write_text(text)

assert git('rev-parse', 'HEAD^') == 'e7a4f937a1ba1f7acb6c2a0245b63d8f2d2dfba8'
git('config', 'user.name', 'github-actions[bot]')
git('config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com')
subprocess.run(['git', 'merge', '--no-commit', '--no-ff', '62227337e6a78d957be25efc374ef95e91341f85'])
assert Path('.git/MERGE_HEAD').exists()
assert set(git('diff', '--name-only', '--diff-filter=U').splitlines()) == {
    'src/ide/ide-tools.js', 'src/ide/main.js', 'src/runtime/entry.js',
    'src/runtime/host.js', 'tools/build.mjs', 'tools/ide-artifacts.json'
}
replace_conflicts('src/ide/main.js', lambda a, b, n: a + b, 1)

def options(a, b, n):
    assert 'const renderingOptions=createRenderingOptions(ide);' in a
    assert b.count('ide.appearance=normalizeAppearance(appearance);') == 1
    b = b.replace('ide.appearance=normalizeAppearance(appearance);', 'renderingOptions.apply();ide.appearance=normalizeAppearance(appearance);')
    needle = "{id:'docking',label:'Docking',node:docking}]"
    assert b.count(needle) == 1
    return ' const renderingOptions=createRenderingOptions(ide);\n' + b.replace(needle, "{id:'docking',label:'Docking',node:docking},{id:'rendering',label:'Rendering',node:renderingOptions.node}]")
replace_conflicts('src/ide/ide-tools.js', options, 1)

def entry(a, b, n):
    if n == 0:
        return a + b
    needle = 'export const RuntimeAPI={'
    assert b.count(needle) == 1
    return b.replace(needle, needle + 'UIRenderer,retainRenderer,rendererForDocument,normalizeRendering,DEFAULT_RENDERING,')
replace_conflicts('src/runtime/entry.js', entry, 2)

def host(a, b, n):
    if n == 0:
        added = "if(options.rendering!==false){this.renderingSession=retainRenderer(container.ownerDocument,options.rendering||project.settings?.rendering||{});this.renderer=this.renderingSession.renderer;}"
        needle = "if(options.bridgeToken)window.addEventListener('message',this.messageHandler);}"
        assert b.count(needle) == 1
        return b.replace(needle, needle[:-1] + added + '}')
    needle = 'this.disposed=true;'
    assert b.count(needle) == 1
    return b.replace(needle, needle + 'this.renderingSession?.release();')
replace_conflicts('src/runtime/host.js', host, 2)
replace_conflicts('tools/build.mjs', lambda a, b, n: b + "fs.writeFileSync('dist/vb6-rendering.js',bundle(path.resolve('src/rendering/entry.js'),'VB6Rendering'));\n", 1)

# Fixed fingerprints authored and reviewed locally, never refreshed by CI.
manifest = json.loads('{"version":2,"files":{"dist/studio.js":{"bytes":6176153,"sha256":"576603e2aef5dcda411c3f0223f63432a626b0b808a8f2c5d1ac44e85866db80"},"dist/VB6-Studio-Web.html":{"bytes":6484496,"sha256":"2b4a46115648e40e4800e811af13a6aa21f105a7cd05e068f5b1b460ab0e0747"},"dist/win32-browser.js":{"bytes":212919,"sha256":"4c3d915ed036a55c176d52afc483631bb1447a3bf44f5c5415aa06ab62cdc0dd"},"packages/win32-browser/dist/win32-browser.js":{"bytes":212919,"sha256":"4c3d915ed036a55c176d52afc483631bb1447a3bf44f5c5415aa06ab62cdc0dd"},"dist/vb6-runtime.js":{"bytes":2188653,"sha256":"1f991e415d63a5a4c6061df9acc2cbed09f5b28f815ad4ed1537fe6d14a2b126"},"src/exporter/runtime-payload.js":{"bytes":2345808,"sha256":"06ac0d8d895ca23402d17946c835907dcb46a57b905884b6ff0c38d2b15a7d0a"},"dist/OCX-Source-Control-Lab.html":{"bytes":2200768,"sha256":"66bc751316e8fbc903c17c7477211e267d4fa1db39ef747cf4be5ebd2b58e4c5"},"dist/examples/orders.html":{"bytes":2343161,"sha256":"89f39eaffddea51b26e4eb2b9bc94bde24a6222b40da314305f36926b10fc3eb"},"dist/examples/calculator.html":{"bytes":2337478,"sha256":"a967c8d2cc01d657d71d6cfce975740333f86b30896388c74d9eb535f3cd4beb"},"dist/examples/clock.html":{"bytes":2331126,"sha256":"27985420f073edf904e959aae73fd18af1f59465b40ef532a1e135b99767b29b"},"dist/examples/graphics.html":{"bytes":2330841,"sha256":"6417ce04d802f52d24278b7bfe5dff04f911aa08e6c752d7ae22707e12774910"},"dist/examples/data.html":{"bytes":2332990,"sha256":"8fade9b0fe611d18888d31c2f365cbea1185d6cdc85f5020d53c8c90f9618d11"},"dist/examples/controls.html":{"bytes":2333411,"sha256":"ccf738b1d3c7142f2b1362506f5fdfcf6477115fd792273887e65cdcf62f6d5a"},"dist/examples/language.html":{"bytes":2329092,"sha256":"515a6b3fc607f8541290d2409f077ee66ee1c513c69d4c1e55b9c6c13e06c44c"},"dist/examples/events.html":{"bytes":2333870,"sha256":"d3bfa2ed59155d6d56207745b16ed4f3b9fc8a3ab6b361baa88b47ef1e38a8cc"},"dist/examples/richtext.html":{"bytes":2336605,"sha256":"9e528a879873d41a6fa1ac6ac8a321034ee769119e20b23b79277461d15081ee"},"dist/examples/compatibility.html":{"bytes":2338706,"sha256":"a8aec1cc4f3e646b01fb4ccddb46fbbc1d2cb63a27e47c4ba79bd5f905959741"},"dist/examples/mdi.html":{"bytes":2333864,"sha256":"24147e631c0af1ae792ea29d5ebf6890370c776617cf1cacdb7b5fa730614f72"},"dist/examples/sqlite-customers.html":{"bytes":2336051,"sha256":"bac458a31989c5da8856581fdda5d763c65ab991c4cd8b11d2dcc824ba486865"},"dist/examples/rest-customers.html":{"bytes":2335867,"sha256":"e77ee8c418048e428557826801c17e597f164d74c4d9c9ad6297573a651455e4"},"dist/examples/rest-public-users.html":{"bytes":2335648,"sha256":"d27a674917366d9c0756031564ebce78fcd7e1f32704a892925fe6e1847ed69e"},"dist/examples/graphql-customers.html":{"bytes":2335773,"sha256":"138fe8985469d5f82c8af06a5cad55529ac89d9f73d55e13005676d5e8f3132a"},"dist/examples/win32.html":{"bytes":2344882,"sha256":"47424ae32a80751aaa075911d8dedd21f05fac2be65cea4db7970054521473fd"},"dist/examples/win32-files.html":{"bytes":2335347,"sha256":"1b8b0b08425f71d626d71aa7f941fe71c60185fbd61daa7ad87427d8ffbb8e99"},"dist/examples/win32-text.html":{"bytes":2332836,"sha256":"f19d5a7593bffd3c86afad90fa6ea801335404d993adfc5c75c5f8d174c35b10"},"dist/examples/win32-sync.html":{"bytes":2333041,"sha256":"19399f766f18073acdf840f3e338ffab490b5955837510948ee866c6bb535a7a"},"dist/examples/win32-registry.html":{"bytes":2333798,"sha256":"a1e75f5e396afafa3aafcf13e7927159afea8b40044de27cdb61dbe0daec90f7"},"dist/examples/win32-guid.html":{"bytes":2333188,"sha256":"8ed1823bf56ca72c23c99c90c6944932083c008dd60fc2eccd7535d66ab07449"},"dist/examples/win32-properties.html":{"bytes":2332871,"sha256":"7d14e590e3be51965ca5901e987c7535bd9b83bcd6247fac6c9453938521cae0"},"dist/examples/win32-calendar.html":{"bytes":2333927,"sha256":"b0d5717fffa906a04d5dc8fe3d90fd5c0824479fdce6b48aaf36aaa70bfbeb7c"},"dist/examples/win32-settings.html":{"bytes":2333750,"sha256":"ef8f95a6fbe1106268b06cc59af805b3ed4b18b49893c8db6ee577909ee6e336"}}}')
Path('tools/ide-artifacts.json').write_text(json.dumps(manifest, indent=2) + '\n')
# Restore the ordinary merged Validate workflow; retain main's new theme jobs.
workflow = Path('.github/workflows/validate.yml')
text = workflow.read_text().split('\n  integrate-rendering:\n')[0] + '\n'
text = text.replace('branches: [main, feat/webgpu-ui-rendering]', 'branches: [main]')
text = text.replace("    if: github.ref != 'refs/heads/feat/webgpu-ui-rendering'\n", '')
workflow.write_text(text)
git('rm', 'tools/integrate-rendering-themes.py')
for command, name in [(['npm', 'run', 'build'], 'build'), (['npm', 'test'], 'tests')]:
    with (OUT / (name + '.log')).open('w') as log:
        subprocess.run(command, stdout=log, stderr=subprocess.STDOUT, check=True)
git('add', '-u')
git('add', 'src', 'tools', 'dist', 'examples', '.github', '.gitignore', 'README.md', 'docs')
git('diff', '--cached', '--check')
assert git('write-tree') == '9c54d48bc62eba011ddc0388c4535e40c164ff70', 'Integrated source differs from reviewed local tree'
git('commit', '-m', 'merge(rendering): preserve application themes, icon packs and read-only GPU references')
git('diff', '--exit-code')
git('push', 'origin', 'HEAD:refs/heads/feat/webgpu-ui-rendering')
(OUT / 'head.txt').write_text(git('rev-parse', 'HEAD') + '\n')
git('archive', '--format=zip', 'HEAD', '-o', str(OUT / 'source.zip'))
