import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import './build-vbnet-migration.mjs';

const root=path.resolve(import.meta.dirname,'..');
const destination=path.join(root,'artifacts/vbnet-migration');
fs.mkdirSync(destination,{recursive:true});
const result=spawnSync(process.platform==='win32'?'npm.cmd':'npm',['pack','--ignore-scripts','--json','--pack-destination',destination],{
  cwd:path.join(root,'packages/vbnet-migration'),encoding:'utf8',shell:process.platform==='win32'
});
if(result.error)throw result.error;
if(result.status!==0)throw new Error(result.stderr||'npm pack failed');
const [manifest]=JSON.parse(result.stdout);
fs.writeFileSync(path.join(destination,'package-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
console.log(path.join(destination,manifest.filename));
