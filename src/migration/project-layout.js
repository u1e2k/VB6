import {qualified,xml} from './names.js';
import {compactIdentifiers} from './vb-tokens.js';

/** Project references are derived from the support plan, not the selected UI target. */
export function projectFile(state,assemblyName) {
  const {options,runtime}=state,ui=state.target==='winforms',namespace=options.rootNamespace;
  const references=[];
  if(options.runtime==='project'){
    if(runtime.core)references.push('    <ProjectReference Include="../VB6.Compatibility/VB6.Compatibility.vbproj" />');
    if(runtime.windows)references.push('    <ProjectReference Include="../VB6.Compatibility.Windows/VB6.Compatibility.Windows.vbproj" />');
  }
  if(options.runtime==='package')for(const dependency of runtime.packages)references.push('    <PackageReference Include="'+xml(dependency.id)+'" Version="'+xml(dependency.version)+'" />');
  const startup=state.directEntry?state.entry.module:'__vbEntry';
  return '<Project Sdk="Microsoft.NET.Sdk">\n  <PropertyGroup>\n'+
    '    <TargetFramework>'+(ui?'net10.0-windows':'net10.0')+'</TargetFramework>\n'+
    '    <OutputType>'+({winforms:'WinExe',console:'Exe',library:'Library'}[state.target])+'</OutputType>\n'+
    '    <RootNamespace>'+xml(namespace)+'</RootNamespace>\n'+
    '    <AssemblyName>'+xml(assemblyName)+'</AssemblyName>\n'+
    '    <OptionExplicit>On</OptionExplicit>\n    <OptionInfer>On</OptionInfer>\n    <OptionStrict>'+(options.strict?'On':'Off')+'</OptionStrict>\n'+
    '    <RemoveIntegerChecks>false</RemoveIntegerChecks>\n    <Deterministic>true</Deterministic>\n'+
    '    <PlatformTarget>'+options.platform+'</PlatformTarget>\n'+
    (ui?'    <UseWindowsForms>true</UseWindowsForms>\n    <EnableWindowsTargeting>true</EnableWindowsTargeting>\n':'')+
    (state.target!=='library'?'    <StartupObject>'+xml((namespace?namespace+'.':'')+startup)+'</StartupObject>\n':'')+
    '  </PropertyGroup>\n'+(references.length?'  <ItemGroup>\n'+references.join('\n')+'\n  </ItemGroup>\n':'')+'</Project>\n';
}

export function entrySource(state) {
  const {entry}=state;
  if(!entry)return "' No valid startup; see migration-report.json.\n";
  const windows=state.target==='winforms',name=qualified(entry.module),file='Application/__vbEntry.vb';
  const require=symbol=>state.runtimePlan.require(symbol,{generatedFile:file,source:entry.module},'Application lifecycle');
  let startup;
  if(entry.kind==='form')startup='        Application.Run('+(state.representations.directForm?'New '+name+'()':require('VbForms.GetInstance')+'(Of '+name+')()')+')\n';
  else startup='        '+name+'.__vbStart()\n'+(windows?'        '+require('VbForms.RunOpenForms')+'()\n':'');
  const imports=state.runtimePlan.imports(file).map(name=>'Imports '+name+'\n').join('');
  const source='Option Strict On\nImports System\n'+(windows?'Imports System.Windows.Forms\n':'')+imports+'\nFriend Module __vbEntry\n'+
    (windows?'    <STAThread>\n':'')+'    Public Sub Main()\n'+
    (windows?'        Application.SetHighDpiMode(HighDpiMode.PerMonitorV2)\n        Application.EnableVisualStyles()\n        Application.SetCompatibleTextRenderingDefault(False)\n':'')+
    startup+'    End Sub\nEnd Module\n';
  return state.options.codeStyle==='native'?source.split('\n').map(compactIdentifiers).join('\n'):source;
}

export function solutionFile(state,assemblyName) {
  const projects=['Application/'+assemblyName+'.vbproj'];
  if(state.options.runtime==='project'){
    if(state.runtime.core)projects.push('VB6.Compatibility/VB6.Compatibility.vbproj');
    if(state.runtime.windows)projects.push('VB6.Compatibility.Windows/VB6.Compatibility.Windows.vbproj');
  }
  return '<Solution>\n'+projects.map(path=>'  <Project Path="'+xml(path)+'" />\n').join('')+'</Solution>\n';
}
