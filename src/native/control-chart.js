import {compileProject} from '../language/compiler.js';
import {NATIVE_CHART_FIELDS as F,NATIVE_CHART_HOSTS,nativeChartCoreSource} from './control-chart-core.js';
import {nativeChartHostMethods} from './control-chart-host.js';
const lit=value=>({kind:'literal',value}),key=v=>String(v).toLowerCase(),mem=memory=>({memory}),arg=argument=>({argument});
const fields={rowcount:F.rows,columncount:F.cols,row:F.row,column:F.col,redraw:F.redraw,charttype:F.charttype};
export function nativeChartSeed(p){
 const int=(v,min,max)=>{v=Number(v);if(!Number.isInteger(v)||v<min||v>max)throw new TypeError('Invalid native chart dimension or index');return v;};
 const rows=int(p.RowCount??5,0,10000),cols=int(p.ColumnCount??1,0,10000),row=int(p.Row??1,1,Math.max(1,rows)),col=int(p.Column??1,1,Math.max(1,cols)),type=Number(p.ChartType??1);
 if(rows*cols>1048576)throw new TypeError('Native chart exceeds 1048576 data values');if(![1,3].includes(type))throw new TypeError('Native chart supports ChartType 1 (column) and 3 (line); other plot types are not lowered');
 let data=p.GridData;if(data===undefined)data=Array.from({length:rows},(_,i)=>Array.from({length:cols},(_,j)=>j===0?[24,38,31,55,42][i%5]:0));
 if(!Array.isArray(data)||data.length>rows)throw new TypeError('Invalid native chart data rows');
 const values=[];for(let r=0;r<data.length;r++){if(!Array.isArray(data[r])||data[r].length>cols)throw new TypeError('Invalid native chart data columns');for(let c=0;c<data[r].length;c++){const value=Number(data[r][c]);if(!Number.isFinite(value))throw new TypeError('Native chart requires finite Double values');values.push({row:r+1,col:c+1,value});}}
 return {rows,cols,row,col,type,redraw:p.Redraw===0?0:-1,values,rowLabels:p.RowLabels??[],colLabels:p.ColumnLabels??[]};
}
export const nativeChartMethods={
 ...nativeChartHostMethods,
 prepareNativeChart(control){if(control.model.type!=='MSChart')return;this.nativeCharts ||= [];control.chartIndex=this.nativeCharts.length;this.nativeCharts.push(control);try{control.chartSeed=nativeChartSeed(control.model.properties);}catch(e){this.fail(control.model.name+': '+e.message,control.module);}this.data.zero(8);},
 prepareChartKernel(){
  if(!this.nativeCharts?.length)return;let name='VB6NativeChart',i=0;while(this.modules.has(key(name)))name='VB6NativeChart'+(++i);
  const program=compileProject({name,modules:[{name,id:name,kind:'module',code:nativeChartCoreSource(this.nativeCharts.length)}]});if(!program.valid)throw new Error('Invalid chart kernel: '+JSON.stringify(program.diagnostics));
  const module=program.modules.get(key(name));module.nativeInternal=true;module.declarations=module.declarations.filter(d=>key(d.name)!=='d');this.data.align(4).label('native:chart:state').zero(Object.keys(F).length*4*this.nativeCharts.length);
  this.externals.set(key(name),new Map());const before=[this.preparingModule,this.preparingProcedure];this.prepareModule(module);[this.preparingModule,this.preparingProcedure]=before;
  this.chartModule=this.modules.get(key(name));this.chartModule.nativeState={label:'native:chart:state',fields:Object.keys(F).length,count:this.nativeCharts.length};this.chartRoots=new Set();this.chartFeatures=new Set();
 },
 chartProc(name){this.chartRoots.add(key(name));return this.chartModule.procedures.get(key(name));},
 invokeChart(name,args){const proc=this.chartProc(name);this.nativeTypedCall(proc,this.nativeCallPlan(proc,args));},
 chartArgs(object){return ['index','hwnd','epoch'].map(field=>({kind:'chartReceiver',field,object}));},
 chartExpression(node){if(node.kind!=='chartReceiver')return false;if(node.field==='hwnd')this.x.value(this.controlHandleRef(node.object));else{this.nativeControlState(node.object);this.x.emit(0x8b,0x80).imm(node.field==='index'?76:80);}return true;},
 chartType(node){if(node.kind==='chartReceiver')return 'long';if(node.kind!=='member'||this.object(node.object)?.model?.type!=='MSChart')return null;const prop=key(node.name);return prop==='data'?'double':['rowlabel','columnlabel'].includes(prop)?'string':Object.hasOwn(fields,prop)?'long':null;},
 getNativeChartProperty(object,prop){if(object?.model?.type!=='MSChart'||!Object.hasOwn(fields,prop)&&!['data','rowlabel','columnlabel'].includes(prop))return false;this.ensure(object);this.chartFeatures.add(prop);this.invokeChart(prop==='data'?'getdata':prop.endsWith('label')?'getlabel':'getfield',[...this.chartArgs(object),...(prop==='data'?[]:[lit(fields[prop]??(prop==='rowlabel'?F.rowlabels:F.collabels))])]);return true;},
 setNativeChartProperty(object,prop,value){if(object?.model?.type!=='MSChart'||!Object.hasOwn(fields,prop)&&!['data','rowlabel','columnlabel'].includes(prop))return false;this.chartFeatures.add(prop);this.invokeChart(prop==='data'?'setdata':prop.endsWith('label')?'setlabel':'setfield',[...this.chartArgs(object),...(prop==='data'?[]:[lit(fields[prop]??(prop==='rowlabel'?F.rowlabels:F.collabels))]),value]);return true;},
 initializeNativeChart(control){
  if(control.model.type!=='MSChart')return;const x=this.x,s=control.chartSeed,base=control.chartIndex*Object.keys(F).length*4;
  x.value(control.chartIndex).store(control.state,76).push(s.cols).push(s.rows).push(mem(control.handle)).push(control.chartIndex).call(this.chartProc('initialize').label);this.checkNativeError();x.push(control.chartIndex).call(this.chartProc('stamp').label);this.checkNativeError();x.store(control.state,80);
  x.value(0).store('native:chart:state',base+F.redraw*4).value(s.type).store('native:chart:state',base+F.charttype*4);
  const setIndex=(r,c)=>x.value(r).store('native:chart:state',base+F.row*4).value(c).store('native:chart:state',base+F.col*4);
  // Persisted chart values are Double even when the JSON number is integral.
  // Untagged synthetic literals intentionally use Long in the scalar compiler;
  // a fractional seed would otherwise emit an unconditional overflow branch.
  for(const {row,col,value}of s.values){setIndex(row,col);this.invokeChart('setdata',[...this.chartArgs(control),{kind:'literal',value,valueType:'double'}]);}
  for(const [labels,field,n]of [[s.rowLabels,F.rowlabels,s.rows],[s.colLabels,F.collabels,s.cols]]){
   if(!Array.isArray(labels)||labels.length>n)this.fail('Native chart labels exceed their axis');for(let i=0;i<labels.length;i++){setIndex(i+1,i+1);this.invokeChart('setlabel',[...this.chartArgs(control),lit(field),lit(String(labels[i]??''))]);}
  }
  setIndex(s.row,s.col);x.value(s.redraw).store('native:chart:state',base+F.redraw*4);
 },
 disposeNativeChart(control){if(control.model.type!=='MSChart')return;this.x.value(0).store(control.state,80).push(control.chartIndex).call(this.chartProc('dispose').label);this.checkNativeError();},
 chartWindowMessages(control,zero,exit,fallback){
  if(control.model.type!=='MSChart')return;const x=this.x,paint=x.unique(),size=x.unique(),next=x.unique(),ready=x.unique(),end=x.unique(),done=x.unique(),save=n=>x.emit(0x89,0x85).imm(n);
  x.value({memory:control.state,addend:80}).test().branch('e',fallback).value(arg(12)).compare(5).branch('e',size).compare(0x14).branch('e',zero).compare(15).branch('e',paint).compare(0x318).branch('e',paint).jump(fallback);
  x.label(size).api('user32.dll','InvalidateRect',[arg(8),0,0]).jump(zero).label(paint).value(0);save(-168);x.value(arg(12)).compare(0x318).branch('ne',next).value(arg(16)).jump(ready);
  x.label(next).local(-112).push().push(arg(8)).invoke('user32.dll','BeginPaint').label(ready);save(-48);x.test().branch('e',end);x.push().invoke('gdi32.dll','SaveDC');save(-168);x.test().branch('e',end);
  x.local(-132).push().push(arg(8)).invoke('user32.dll','GetClientRect').test().branch('e',end);
  x.value({memory:'native:chart:state',addend:control.chartIndex*Object.keys(F).length*4+F.redraw*4}).test().branch('e',end);
  this.nativeControlColors=true;x.value({memory:control.state,addend:32}).push().call('native:control:ole-color').push().push(arg(-48)).invoke('gdi32.dll','SetDCBrushColor').api('gdi32.dll','GetStockObject',[18]).push().local(-132).push().push(arg(-48)).invoke('user32.dll','FillRect');
  x.push(arg(-120)).push(arg(-124)).push(arg(-48)).push({memory:control.state,addend:80}).push(arg(8)).push(control.chartIndex).call(this.chartProc('paint').label);
  x.label(end).value(arg(-168)).test().branch('e',done+':restore').push().push(arg(-48)).invoke('gdi32.dll','RestoreDC').label(done+':restore').value(arg(12)).compare(0x318).branch('e',done).local(-112).push().push(arg(8)).invoke('user32.dll','EndPaint').label(done);this.checkNativeError();x.jump(zero);
 },
 emitChartKernel(){if(!this.chartModule)return;const needed=new Set(),visit=name=>{if(needed.has(name))return;needed.add(name);const proc=this.chartModule.procedures.get(name),walk=n=>{if(!n||typeof n!=='object')return;if(n.kind==='id'&&this.chartModule.procedures.has(key(n.name)))visit(key(n.name));for(const v of Object.values(n))walk(v);};if(proc)walk(proc.proc.code);};for(const name of this.chartRoots)visit(name);for(const [name,proc]of this.chartModule.procedures)if(needed.has(name)){if(Object.hasOwn(NATIVE_CHART_HOSTS,name))this.emitChartHost(name,proc);else this.procedure(proc);}this.chartEmitted=[...needed].sort();}
};
