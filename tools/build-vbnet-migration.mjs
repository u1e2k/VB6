import fs from 'node:fs';
import path from 'node:path';
import {bundle} from './bundle.mjs';
import './build-vbnet-runtime.mjs';
const root=path.resolve(import.meta.dirname,'..'),packageRoot=path.join(root,'packages/vbnet-migration');
const seen=new Set();
function copy(file){
  const absolute=path.resolve(root,file);if(seen.has(absolute))return;seen.add(absolute);
  const relative=path.relative(root,absolute);if(relative.startsWith('..')||path.isAbsolute(relative))throw new Error('Package dependency escaped repository');
  const source=fs.readFileSync(absolute,'utf8');
  for(const match of source.matchAll(/^import\s+(?:[^;]*?\s+from\s+)?['"]([^'"]+)['"];?\s*$/gm))if(match[1].startsWith('.'))copy(path.relative(root,path.resolve(path.dirname(absolute),match[1])));
  const target=path.join(packageRoot,'lib',relative);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,source);
}
// Generated output directory is dedicated to this package, never source.
fs.rmSync(path.join(packageRoot,'lib'),{recursive:true,force:true});
copy('src/migration/index.js');copy('src/migration/cli.mjs');
fs.mkdirSync(path.join(packageRoot,'dist'),{recursive:true});
fs.writeFileSync(path.join(packageRoot,'dist/vbnet-migration.js'),bundle(path.join(root,'src/migration/index.js'),'VB6Migration'));
console.log('Built standalone VB.NET migration package ('+seen.size+' modules).');
