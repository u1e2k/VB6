import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const files={};
for(const [directory,name] of [['vbnet-runtime','VB6.Compatibility'],['vbnet-runtime-windows','VB6.Compatibility.Windows']]) {
  const dir=path.join(root,'packages',directory);
  files[`${name}/LICENSE`]=fs.readFileSync(path.join(dir,'LICENSE'),'utf8');
  files[`${name}/${name}.vbproj`]=fs.readFileSync(path.join(dir,`${name}.vbproj`),'utf8');
  for(const file of fs.readdirSync(path.join(dir,'src')).filter(p=>p.endsWith('.vb')).sort())
    files[`${name}/src/${file}`]=fs.readFileSync(path.join(dir,'src',file),'utf8');
}
fs.writeFileSync(path.join(root,'src/migration/runtime-sources.js'), '// Generated from packages/vbnet-runtime* by tools/build-vbnet-runtime.mjs.\nexport const RUNTIME_FILES = '+JSON.stringify(files,null,2)+';\n');
