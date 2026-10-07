/** Linux x86-64 hardware check of identical 32-bit arithmetic and REP encodings.
 * This is not PE32 execution, an x86 stack ABI test or a VB6 differential oracle.
 * The only REX instruction is a labelled harness adapter for error reporting.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {BinarySection} from '../src/native/pe32.js';
import {X86} from '../src/native/x86.js';
import {emitNativePowerOfTwoDivision} from '../src/native/strength-reduction.js';
import {emitNativeCountedEqual} from '../src/native/string-kernels.js';
function code(emit){
 const s=new BinarySection('.text',0x60000020),x=new X86(s,null);emit(x);
 const out=Uint8Array.from(s.bytes),v=new DataView(out.buffer);
 for(const f of s.fixups){if(f.kind!=='rel'||!s.labels.has(f.label))throw new Error('Unexpected CPU-harness relocation');v.setInt32(f.offset,s.labels.get(f.label)+f.addend-f.offset-4,true);}
 return [...out];
}
export function verifyNativeOptimizerCPU(){
 if(process.platform!=='linux'||process.arch!=='x64')throw new Error('Native optimizer CPU check requires Linux x86-64 and cc');
 const functions=[],cases=[];
 for(let shift=0;shift<=31;shift++)for(const sign of [1,-1]){
  const divisor=sign*2**shift;if(divisor>2147483647)continue;
  for(const operation of ['\\','mod']){
   const name='arithmetic'+cases.length,bytes=code(x=>{
    x.mov('eax','edi');if(!emitNativePowerOfTwoDivision(x,operation,divisor))throw new Error('Missing strength reduction');x.ret();
    // SysV uint64 return: bit 32 marks VB error 6, low 32 bits carry normal values.
    x.label('error:6').mov('eax',1).emit(0x48,0xc1,0xe0,32).ret();
   });
   functions.push(`static const unsigned char ${name}[]={${bytes}};`);cases.push(`{${name},sizeof(${name}),${divisor}LL,${operation==='mod'?1:0}}`);
  }
 }
 for(const width of [8,16,32])functions.push(`static const unsigned char equal${width}[]={${code(x=>{x.mov('ecx','edx');emitNativeCountedEqual(x,width);x.ret();})}};`);
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'vb6-optimizer-cpu-'));
 try{
  const source=path.join(dir,'check.c'),exe=path.join(dir,'check');
  fs.writeFileSync(source,`#include <stdint.h>
#include <stdio.h>
#include <string.h>
#include <sys/mman.h>
#include <unistd.h>
${functions.join('\n')}
struct arithmetic_case {const unsigned char *code;size_t length;int64_t divisor;int mod;};
static const struct arithmetic_case cases[]={${cases}};
static void *executable(const unsigned char *bytes,size_t length,long page){
 if(length>(size_t)page)return 0;void *p=mmap(0,page,PROT_READ|PROT_WRITE,MAP_PRIVATE|MAP_ANONYMOUS,-1,0);
 if(p==MAP_FAILED)return 0;memcpy(p,bytes,length);if(mprotect(p,page,PROT_READ|PROT_EXEC)){munmap(p,page);return 0;}return p;
}
static uint64_t expected(int32_t a,const struct arithmetic_case *c){
 if(!c->mod&&a==INT32_MIN&&c->divisor==-1)return UINT64_C(1)<<32;
 return (uint32_t)(c->mod?(int64_t)a%c->divisor:(int64_t)a/c->divisor);
}
int main(void){
 long page=sysconf(_SC_PAGESIZE);if(page<4096)return 90;uint64_t arithmetic=0,strings=0;uint32_t seed=0x243f6a88;
 static const int32_t boundary[]={INT32_MIN,INT32_MIN+1,-1073741825,-1073741824,-65537,-65536,-32769,-129,-128,-1,0,1,127,128,32768,65535,65536,1073741823,1073741824,INT32_MAX-1,INT32_MAX};
 for(size_t c=0;c<sizeof(cases)/sizeof(cases[0]);c++){
  void *p=executable(cases[c].code,cases[c].length,page);if(!p)return 91;uint64_t (*run)(int32_t)=(uint64_t(*)(int32_t))p;
  for(int32_t a=-32768;a<=32767;a++){if(run(a)!=expected(a,&cases[c]))return 1;arithmetic++;}
  for(size_t i=0;i<sizeof(boundary)/sizeof(boundary[0]);i++){if(run(boundary[i])!=expected(boundary[i],&cases[c]))return 2;arithmetic++;}
  for(int i=0;i<4096;i++){seed^=seed<<13;seed^=seed>>17;seed^=seed<<5;int32_t a;memcpy(&a,&seed,4);if(run(a)!=expected(a,&cases[c]))return 3;arithmetic++;}
  munmap(p,page);
 }
 const unsigned char *code[]={equal8,equal16,equal32};const size_t lengths[]={sizeof(equal8),sizeof(equal16),sizeof(equal32)};
 for(int w=0;w<3;w++){
  void *p=executable(code[w],lengths[w],page);if(!p)return 92;
  uint32_t (*run)(void*,void*,uint32_t)=(uint32_t(*)(void*,void*,uint32_t))p;
  unsigned char *a=mmap(0,page*2,PROT_NONE,MAP_PRIVATE|MAP_ANONYMOUS,-1,0),*b=mmap(0,page*2,PROT_NONE,MAP_PRIVATE|MAP_ANONYMOUS,-1,0);
  if(a==MAP_FAILED||b==MAP_FAILED)return 93;if(mprotect(a,page,PROT_READ|PROT_WRITE)||mprotect(b,page,PROT_READ|PROT_WRITE))return 94;
  for(uint32_t n=0;n<=257;n++){
   size_t bytes=(size_t)n*(1u<<w);unsigned char *left=a+page-bytes,*right=b+page-bytes;
   for(size_t i=0;i<bytes;i++)left[i]=right[i]=(unsigned char)((i%5)?i*37:0);
   if(run(left,right,n)!=1)return 4;strings++;
   for(size_t i=0;i<bytes;i++){right[i]^=0x81;if(run(left,right,n)!=0)return 5;strings++;right[i]^=0x81;}
  }
  munmap(a,page*2);munmap(b,page*2);munmap(p,page);
 }
 printf("{\\"ok\\":true,\\"arithmeticAssertions\\":%llu,\\"stringAssertions\\":%llu}\\n",(unsigned long long)arithmetic,(unsigned long long)strings);return 0;
}
`);
  const built=spawnSync('cc',['-std=c11','-D_GNU_SOURCE','-O2',source,'-o',exe],{encoding:'utf8',timeout:20000});
  if(built.error||built.status!==0)throw new Error('CPU harness compilation failed: '+(built.error?.message||built.stderr));
  const result=spawnSync(exe,[],{cwd:dir,encoding:'utf8',timeout:20000});
  if(result.error||result.status!==0)throw new Error('CPU optimizer assertions failed: '+JSON.stringify({status:result.status,signal:result.signal,stderr:result.stderr,error:result.error?.message}));
  return {...JSON.parse(result.stdout),platform:'Linux x86-64',scope:'identical arithmetic/REP encodings; not PE32 or Windows ABI'};
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)console.log(JSON.stringify(verifyNativeOptimizerCPU(),null,2));
