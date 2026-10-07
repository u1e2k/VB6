/** Failure-only instrumentation of the same native fixture. The original EXE's
 * result remains authoritative; these checkpoints only localize crashes/errors. */
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {nativeControlFixtures} from './win32-control-fixtures.mjs';
import {compileWin32} from '../src/native/compiler.js';
const api=`Private Declare Function TraceHandle Lib "kernel32" Alias "GetStdHandle" (ByVal kind As Long) As Long
Private Declare Function TraceWrite Lib "kernel32" Alias "WriteFile" (ByVal handle As Long, ByVal data As Long, ByVal bytes As Long, written As Long, ByVal overlap As Long) As Long`;
const routine=`Private Sub NativeTrace(ByVal message As String)
 Dim written As Long, result As Long
 message=message & vbCrLf
 result=TraceWrite(TraceHandle(-11),StrPtr(message),LenB(message),written,0)
End Sub`;
export function traceControlFixture(project){
  const copy=structuredClone(project),module=copy.modules[0],lines=module.code.split('\n');let inside=false;
  module.code=lines.flatMap((line,index)=>{
    if(/^Private Sub Form_Load\(\)/i.test(line)){inside=true;return [line,'NativeTrace "Form_Load"'];}
    if(/^End Sub/i.test(line))inside=false;
    if(!inside||/^\s*(Dim |End If|Else|Next\b)/i.test(line))return [line];
    const marker=`NativeTrace "line ${index+1}: ${line.trim().slice(0,150).replaceAll('"','""')}"`;
    const values=[];
    if(line.includes('Pages.Tabs.Count=3'))values.push('NativeTrace "Tabs=" & CStr(Pages.Tabs.Count) & "," & CStr(Strip.Tabs.Count)');
    if(line.includes('Drives.ListCount>0'))values.push('NativeTrace "Drives=" & CStr(Drives.ListCount)');
    if(line.includes('Left$(s,5)='))values.push('NativeTrace "RTF length=" & CStr(Len(s)) & ", prefix=" & Left$(s,48)', 'If Len(s)>0 Then NativeTrace "First UTF16=" & CStr(AscW(Left$(s,1)))');
    if(line.includes('Rich.Text=Plain.Text'))values.push('NativeTrace "RTF=" & s','NativeTrace "Actual=" & Rich.Text & ", expected=" & Plain.Text','NativeTrace "Lengths=" & CStr(Len(Rich.Text)) & "," & CStr(Len(Plain.Text))');
    return [marker,...values,line];
  }).join('\n').replace('Option Explicit','Option Explicit\n'+api)+'\n'+routine+'\n';
  return copy;
}
export function buildControlTrace(name,filename){
  const match=String(name).match(/^(AotControl\w+)-O([012])$/);
  const fixture=match&&nativeControlFixtures().find(f=>f.project.name===match[1]);
  if(!fixture)throw new TypeError('Unknown native control fixture: '+name);
  const project=traceControlFixture(fixture.project),result=compileWin32(project,{optimization:Number(match[2])});
  fs.writeFileSync(filename,result.bytes);
  return {name,bytes:result.bytes.length,checks:fixture.checks};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)console.log(JSON.stringify(buildControlTrace(process.argv[2],process.argv[3])));
