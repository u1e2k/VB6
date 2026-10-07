/** Native SDK builder. No shell interpolation, downloaded toolchains or runtime VM. */
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createHash,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {macOSOptions} from './target.js';
import {inspectMachO} from './mach-o.js';

const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const MAX_LOG=4*1024*1024;
export class NativeBuildError extends Error {
  constructor(message,details={}) {super(message);this.name='NativeBuildError';Object.assign(this,details);}
}
export async function runTool(executable,args,{cwd,timeout=180000,signal,log}={}) {
  if(!path.isAbsolute(executable)||!Array.isArray(args)||args.some(a=>typeof a!=='string'||a.includes('\0')))throw new TypeError('Absolute tool and NUL-free string arguments required');
  if(!Number.isInteger(timeout)||timeout<1000||timeout>600000)throw new TypeError('Tool timeout must be 1000..600000 ms');
  return new Promise((resolve,reject)=>{
    let output='',size=0,timedOut=false,settled=false;
    const child=spawn(executable,args,{cwd,env:{...process.env,LC_ALL:'C'},shell:false,stdio:['ignore','pipe','pipe'],signal});
    const timer=setTimeout(()=>{timedOut=true;child.kill('SIGKILL');},timeout);timer.unref();
    function finish(error,value){if(settled)return;settled=true;clearTimeout(timer);error?reject(error):resolve(value);}
    const consume=data=>{size+=data.length;if(size>MAX_LOG){child.kill('SIGKILL');finish(new NativeBuildError('Native tool output exceeds 4 MiB',{tool:path.basename(executable)}));return;}const text=data.toString('utf8');output+=text;log?.(text);};
    child.stdout.on('data',consume);child.stderr.on('data',consume);
    child.on('error',error=>finish(new NativeBuildError(error.message,{cause:error,tool:path.basename(executable),output})));
    child.on('close',(code,killedBy)=>{
      if(code!==0)finish(new NativeBuildError(timedOut?'Native tool timed out':`${path.basename(executable)} failed (${code??killedBy})`,{tool:path.basename(executable),args,code,output}));
      else finish(null,output.trim());
    });
  });
}
async function regularFile(filename,max=16*1024*1024) {
  const stat=await fs.lstat(filename);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>max)throw new NativeBuildError('Expected a bounded regular file: '+filename);
  const bytes=await fs.readFile(filename);if(bytes.length!==stat.size)throw new NativeBuildError('Source changed while reading: '+filename);return bytes;
}
async function exists(filename){try{await fs.lstat(filename);return true;}catch(error){if(error.code==='ENOENT')return false;throw error;}}
export async function writeBuildKit(directory,files) {
  await fs.mkdir(directory,{recursive:false,mode:0o700});
  try {
    let total=0;
    for(const [name,content]of Object.entries(files)) {
      if(typeof name!=='string'||name.includes('\\')||name.startsWith('/')||name.split('/').some(p=>!p||p==='.'||p==='..'||/[\x00-\x1f:]/.test(p)))throw new NativeBuildError('Unsafe build-kit path');
      if(typeof content!=='string'&&!(content instanceof Uint8Array))throw new NativeBuildError('Invalid build-kit content');
      const bytes=typeof content==='string'?Buffer.from(content):content;total+=bytes.length;
      if(total>100*1024*1024||bytes.length>20*1024*1024)throw new NativeBuildError('Build kit exceeds size limits');
      const destination=path.join(directory,name);await fs.mkdir(path.dirname(destination),{recursive:true,mode:0o700});await fs.writeFile(destination,bytes,{flag:'wx',mode:0o600});
    }
  }catch(error){await fs.rm(directory,{recursive:true,force:true});throw error;}
  return directory;
}
async function safeDirectory(directory) {
  const absolute=path.resolve(directory);await fs.mkdir(absolute,{recursive:true,mode:0o700});
  const stat=await fs.lstat(absolute);if(!stat.isDirectory()||stat.isSymbolicLink())throw new NativeBuildError('Output directory cannot be a symbolic link');return fs.realpath(absolute);
}
async function publish(staged,destination,{force=false}={}) {
  if(await exists(destination)) {
    const current=await fs.lstat(destination);if(current.isSymbolicLink())throw new NativeBuildError('Refusing to replace an output symlink');
    if(!force)throw new NativeBuildError('Output already exists: '+destination);
    const backup=destination+'.previous-'+randomUUID();await fs.rename(destination,backup);
    try{await fs.rename(staged,destination);}catch(error){await fs.rename(backup,destination);throw error;}
    await fs.rm(backup,{recursive:true,force:true});
  }else {
    // macOS renamex_np(RENAME_EXCL) is used for atomic exclusive directory publication.
    // The helper is compiled from fixed SDK code, never project-supplied commands.
    const source=path.join(path.dirname(staged),'.publish.c'),binary=source+'.bin';
    await fs.writeFile(source,'#include <stdio.h>\n#include <errno.h>\nint main(int argc,char**argv){if(argc!=3)return 64;return renamex_np(argv[1],argv[2],RENAME_EXCL)==0?0:errno;}\n',{flag:'wx'});
    try{await runTool('/usr/bin/xcrun',['clang','-O2',source,'-o',binary]);await runTool(binary,[staged,destination]);}
    finally{await fs.rm(source,{force:true});await fs.rm(binary,{force:true});}
  }
}
export async function buildNativeKit(directory,{out,identity='-',force=false,zip=true,jobs,cache,signal,log,timeout=180000}={}) {
  if(process.platform!=='darwin')throw new NativeBuildError('Executable export requires macOS and Xcode Command Line Tools. Export the source build kit on this platform.');
  const root=await fs.realpath(directory),manifest=JSON.parse((await regularFile(path.join(root,'build.json'),1024*1024)).toString('utf8'));
  if(manifest.version!==1||manifest.target!=='macos-arm64'||!Array.isArray(manifest.sources)||!Array.isArray(manifest.headers)||!Array.isArray(manifest.resources))throw new NativeBuildError('Invalid macOS build manifest');
  const options=macOSOptions(manifest.options);
  if(typeof identity!=='string'||!identity||identity.length>512||/[\x00-\x1f\x7f]/.test(identity)||identity.startsWith('-')&&identity!=='-')throw new NativeBuildError('Invalid signing identity');
  jobs=jobs??Math.min(os.availableParallelism(),4);if(!Number.isInteger(jobs)||jobs<1||jobs>16)throw new NativeBuildError('jobs must be 1..16');
  if(!Number.isInteger(timeout)||timeout<1000||timeout>600000)throw new NativeBuildError('Tool timeout must be between 1 and 600 seconds');
  const output=await safeDirectory(out??path.join(root,'out')),destination=path.join(output,options.name+'.app');
  for(const file of [destination,...(zip?[path.join(output,options.name+'.app.zip')]:[]),path.join(output,options.name+'.build.json')])if(!force&&await exists(file))throw new NativeBuildError('Output already exists: '+file);
  const invoke=(exe,args,extra={})=>runTool(exe,args,{cwd:root,timeout,signal,log,...extra});
  const compiler=await invoke('/usr/bin/xcrun',['--sdk','macosx','--find','clang++']),sdk=await invoke('/usr/bin/xcrun',['--sdk','macosx','--show-sdk-path']);
  if(!path.isAbsolute(compiler)||!path.isAbsolute(sdk))throw new NativeBuildError('Xcode toolchain did not return absolute paths');
  const compilerVersion=await invoke(compiler,['--version']),sdkVersion=await invoke('/usr/bin/xcrun',['--sdk','macosx','--show-sdk-version']);
  const inputs=new Map(),names=new Set();
  for(const name of [...manifest.sources,...manifest.headers]) {
    if(typeof name!=='string'||!/^native\/[a-z0-9-]+\.(?:cpp|mm|hpp)$/.test(name)||names.has(name)||name.includes('portable-host'))throw new NativeBuildError('Invalid or duplicate native SDK source');
    names.add(name);const bytes=await regularFile(path.join(root,name),2*1024*1024);inputs.set(name,bytes);
  }
  if(!manifest.sources.length||!manifest.sources.some(s=>s.endsWith('appkit-host.mm')))throw new NativeBuildError('Native AppKit SDK is missing');
  const main=await regularFile(path.join(root,'main.cpp'));await regularFile(path.join(root,'Info.plist'),65536);
  const sourceMap=await regularFile(path.join(root,'source-map.json'),16*1024*1024);
  const flags=['-std=c++17','-arch','arm64','-isysroot',sdk,`-mmacosx-version-min=${options.minimumVersion}`,`-O${options.optimization}`,'-fvisibility=hidden','-fvisibility-inlines-hidden','-fexceptions','-Wall','-Wextra','-Wno-unused-parameter','-Wno-logical-op-parentheses','-Wno-deprecated-declarations','-I',path.join(root,'native')];
  // Whole SDK hashing prevents mixing objects from different runtime revisions.
  const digest=createHash('sha256').update(compilerVersion).update(sdk).update(sdkVersion).update(JSON.stringify(flags.filter(v=>v!==path.join(root,'native'))));
  for(const [name,bytes]of [...inputs].sort(([a],[b])=>a.localeCompare(b)))digest.update(name).update('\0').update(bytes);
  const runtimeHash=digest.digest('hex');
  const cacheRoot=await safeDirectory(cache??path.join(os.homedir(),'Library','Caches','VB6Studio','native-arm64'));
  const cached=path.join(cacheRoot,runtimeHash),archive=path.join(cached,'libvb6-native.a');
  let cacheHit=false;
  if(await exists(archive)) {
    const info=JSON.parse((await regularFile(path.join(cached,'cache.json'),65536)).toString('utf8'));
    if(info.runtimeHash!==runtimeHash||info.sha256!==hash(await regularFile(archive,256*1024*1024)))throw new NativeBuildError('Native SDK cache integrity check failed; remove '+cached);
    cacheHit=true;
  }else {
    const temporary=await fs.mkdtemp(path.join(cacheRoot,'.runtime-'));let committed=false;
    try {
      let next=0;const objects=new Array(manifest.sources.length);
      const tasks=await Promise.allSettled(Array.from({length:Math.min(jobs,manifest.sources.length)},async()=>{
        for(;;){const index=next++;if(index>=manifest.sources.length)return;const name=manifest.sources[index],object=path.join(temporary,index+'.o');
          await invoke(compiler,[...flags,...(name.endsWith('.mm')?['-fobjc-arc']:[]),'-c',path.join(root,name),'-o',object]);objects[index]=object;
        }
      }));
      const failure=tasks.find(result=>result.status==='rejected');if(failure)throw failure.reason;
      const library=path.join(temporary,'libvb6-native.a');await invoke('/usr/bin/xcrun',['libtool','-static','-o',library,...objects]);
      await fs.writeFile(path.join(temporary,'cache.json'),JSON.stringify({version:1,runtimeHash,sha256:hash(await regularFile(library,256*1024*1024))})+'\n',{flag:'wx',mode:0o600});
      for(const object of objects)await fs.rm(object);
      // Concurrent builders may win publication. They must have identical content contracts.
      try{await fs.rename(temporary,cached);committed=true;}catch(error){if(!['EEXIST','ENOTEMPTY'].includes(error.code))throw error;}
    }finally{if(!committed)await fs.rm(temporary,{recursive:true,force:true});}
    if(!await exists(archive))throw new NativeBuildError('Native SDK cache was not published');
    const info=JSON.parse((await regularFile(path.join(cached,'cache.json'),65536)).toString('utf8'));
    if(info.runtimeHash!==runtimeHash||info.sha256!==hash(await regularFile(archive,256*1024*1024)))throw new NativeBuildError('Concurrent native SDK cache integrity check failed');
  }
  const stage=await fs.mkdtemp(path.join(output,'.vb6-build-'));
  try {
    const app=path.join(stage,options.name+'.app'),contents=path.join(app,'Contents'),macos=path.join(contents,'MacOS'),resources=path.join(contents,'Resources');
    await fs.mkdir(macos,{recursive:true});await fs.mkdir(resources,{recursive:true});
    await fs.copyFile(path.join(root,'Info.plist'),path.join(contents,'Info.plist'));
    const resourceNames=new Set();let resourceTotal=0;
    for(const name of manifest.resources){
      if(typeof name!=='string'||!name.startsWith('resources/')||name.includes('\\')||name.split('/').some(p=>!p||p==='.'||p==='..'||/[\x00-\x1f:]/.test(p)))throw new NativeBuildError('Unsafe resource path');
      const relative=name.slice(10),key=relative.normalize('NFD').toLowerCase();if(resourceNames.has(key))throw new NativeBuildError('Resource filename collision');resourceNames.add(key);
      const bytes=await regularFile(path.join(root,name),20*1024*1024);resourceTotal+=bytes.length;if(resourceTotal>50*1024*1024)throw new NativeBuildError('Resources exceed 50 MiB');
      const target=path.join(resources,relative);await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,bytes,{flag:'wx',mode:0o644});
    }
    await fs.writeFile(path.join(resources,'vb6-source-map.json'),sourceMap,{flag:'wx'});
    await fs.writeFile(path.join(resources,'vb6-build.json'),JSON.stringify({target:'macos-arm64',options,sourceSha256:hash(main),runtimeSha256:runtimeHash,compilerVersion,sdkVersion,report:manifest.report},null,2)+'\n',{flag:'wx'});
    const executable=path.join(macos,options.name),mainObject=path.join(stage,'main.o');
    await invoke(compiler,[...flags,'-c',path.join(root,'main.cpp'),'-o',mainObject]);
    await invoke(compiler,['-arch','arm64','-isysroot',sdk,`-mmacosx-version-min=${options.minimumVersion}`,mainObject,archive,'-framework','AppKit','-framework','Foundation','-framework','CoreGraphics','-framework','QuartzCore','-Wl,-dead_strip','-Wl,-pie','-o',executable]);
    await fs.chmod(executable,0o755);
    await invoke('/usr/bin/plutil',['-lint',path.join(contents,'Info.plist')]);
    await invoke('/usr/bin/codesign',['--force','--sign',identity,...(identity==='-'?['--timestamp=none']:['--options','runtime','--timestamp']),app]);
    await invoke('/usr/bin/codesign',['--verify','--strict','--verbose=2',app]);
    const binary=await regularFile(executable,256*1024*1024),image=inspectMachO(binary);
    if(image.build.minimumVersion.split('.').slice(0,2).join('.')!==options.minimumVersion.split('.').slice(0,2).join('.'))throw new NativeBuildError('Installed SDK changed the requested deployment target: '+image.build.minimumVersion);
    if(!image.signature||!image.pie)throw new NativeBuildError('Native image must be signed and position independent');
    if(image.dylibs.some(lib=>!lib.startsWith('/System/Library/')&&!lib.startsWith('/usr/lib/')))throw new NativeBuildError('Executable unexpectedly depends on a non-system dynamic library');
    let zipName=null,zipSha256=null;
    if(zip){zipName=options.name+'.app.zip';const file=path.join(stage,zipName);await invoke('/usr/bin/ditto',['-c','-k','--sequesterRsrc','--keepParent',app,file]);zipSha256=hash(await regularFile(file,256*1024*1024));if(!force&&await exists(path.join(output,zipName)))throw new NativeBuildError('ZIP output already exists');}
    const report={...manifest.report,artifact:'native-executable',app:destination,executable:path.join(destination,'Contents','MacOS',options.name),architecture:'arm64',format:'Mach-O',bytes:binary.length,sha256:hash(binary),sourceSha256:hash(main),runtimeSha256:runtimeHash,cacheHit,compilerVersion,sdkVersion,signing:identity==='-'?'ad-hoc':'identity',signatureVerified:true,notarized:false,image,...(zipName?{zip:path.join(output,zipName),zipSha256}:{})};
    await fs.writeFile(path.join(stage,options.name+'.build.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
    await publish(app,destination,{force});
    for(const name of [...(zipName?[zipName]:[]),options.name+'.build.json'])await publish(path.join(stage,name),path.join(output,name),{force});
    return report;
  }finally{await fs.rm(stage,{recursive:true,force:true});}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const options={};for(let i=2;i<process.argv.length;++i){const arg=process.argv[i];if(arg==='--force')options.force=true;else if(arg==='--no-zip')options.zip=false;else if(['--out','--identity','--jobs','--cache'].includes(arg)){if(!process.argv[i+1])throw new Error('Missing value for '+arg);options[arg.slice(2)]=arg==='--jobs'?Number(process.argv[++i]):process.argv[++i];}else throw new Error('Unknown option: '+arg);}
    console.log(JSON.stringify(await buildNativeKit(import.meta.dirname,{...options,log:text=>process.stderr.write(text)}),null,2));
  }catch(error){console.error(error.message);if(error.output)console.error(error.output);process.exitCode=1;}
}
