/** Generate real current-runtime exports for the browser integration harness. */
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {commonBoundProject} from '../tests/fixtures/common-bound-project.js';
import {exportApplication,exportApplicationFiles} from '../src/exporter/exporter.js';
const root=fileURLToPath(new URL('../',import.meta.url)),base=process.argv[2];
const url=new URL(base);if(!['127.0.0.1','localhost'].includes(url.hostname)||url.protocol!=='http:')throw Error('Supply the loopback test server origin');
const directory=path.join(root,'reports/com-ole/exports'),project=commonBoundProject(url.origin);
await fs.mkdir(directory,{recursive:true});await fs.writeFile(path.join(directory,'project.json'),JSON.stringify(project));
await fs.writeFile(path.join(directory,'inline.html'),exportApplication(project,{persist:false,nativeWindows:false}));
const exported=exportApplicationFiles(project,{persist:false,nativeWindows:false});
for(const [name,content]of Object.entries(exported.files)){const file=path.join(directory,'modular',name);await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,content);}
console.log('Generated form-binding exports using the complete matching runtime.');
