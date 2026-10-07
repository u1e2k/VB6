import {valueRuntime} from './runtime-values.js';
import {arrayRuntime} from './runtime-arrays.js';
import {formRuntime} from './runtime-forms.js';
import {vbString} from './contracts.js';
export function runtimeFiles(context){
  const metadata=new Map((context.project.nativeProject?.entries||[]).map(e=>[e.key.toLowerCase(),e.value]));
  const version=key=>/^\d+$/.test(metadata.get(key)||'')?Number(metadata.get(key)):0;
  const application=`Option Explicit On
Option Strict On
Namespace Global.Vb6Migration.Runtime
    Public Module VbApplication
        Public ReadOnly Property Path As String
            Get
                Return Global.System.AppContext.BaseDirectory.TrimEnd(Global.System.IO.Path.DirectorySeparatorChar)
            End Get
        End Property
        Public Property Title As String = ${vbString(context.project.name)}
        Public ReadOnly Property EXEName As String
            Get
                Return Global.System.IO.Path.GetFileNameWithoutExtension(Global.System.Environment.ProcessPath)
            End Get
        End Property
        Public ReadOnly Property Major As Short = ${version('majorver')}
        Public ReadOnly Property Minor As Short = ${version('minorver')}
        Public ReadOnly Property Revision As Short = ${version('revisionver')}
    End Module
End Namespace
`;
  const files={'Runtime/VbRuntime.vb':valueRuntime,'Runtime/VbArray.vb':arrayRuntime,'Runtime/VbApplication.vb':application};
  if(context.target==='windows')files['Runtime/VbForms.vb']=formRuntime;
  const custom=context.registry.dispatch('runtime',{files,features:[...context.runtimeFeatures].sort()},context);
  return custom===undefined?files:custom;
}
