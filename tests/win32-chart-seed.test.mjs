import test from 'node:test';
import assert from 'node:assert/strict';
import {newProject,createControl} from '../src/project/model.js';
import {compileWin32} from '../src/native/compiler.js';
import {PE32Image} from '../src/native/pe32.js';
import {nativeChartMethods,nativeChartSeed} from '../src/native/control-chart.js';

const values=[12.25,-4.5,3,2147483648,-2147483649,Number.MAX_VALUE,-Number.MAX_VALUE,Number.MIN_VALUE,-0,0];
const properties={RowCount:1,ColumnCount:values.length,GridData:[values],RowLabels:[],ColumnLabels:[]};

test('persisted chart values explicitly carry Double metadata at the native call boundary',()=>{
  const calls=[],x=new Proxy({}, {get:()=>()=>x});
  const control={model:{type:'MSChart'},chartIndex:0,chartSeed:nativeChartSeed(properties),state:'state',handle:'window'};
  const compiler={x,chartProc:name=>({label:name}),checkNativeError(){},chartArgs:()=>[],invokeChart:(name,args)=>calls.push({name,args})};
  nativeChartMethods.initializeNativeChart.call(compiler,control);
  const data=calls.filter(c=>c.name==='setdata');
  assert.equal(data.length,values.length);
  for(const [i,{args}] of data.entries()){
    assert.equal(args[0].kind,'literal');assert.equal(args[0].valueType,'double');
    assert.ok(Object.is(args[0].value,values[i]),'retain exact JSON-number value, including negative zero');
  }
});

for(const optimization of [0,1,2])test(`chart seeds emit binary Double constants without unconditional overflow at O${optimization}`,t=>{
  const project=newProject('ChartSeedABI'),control=createControl('MSChart','Plot');
  Object.assign(control.properties,properties);project.modules[0].form.controls=[control];
  project.modules[0].code='Private Sub Form_Load()\nEnd\nEnd Sub';
  const before=structuredClone(project),finish=PE32Image.prototype.finish;let linked,jumps;
  t.mock.method(PE32Image.prototype,'finish',function(...args){
    linked=finish.apply(this,args);
    const text=this.sections.find(s=>s.name==='.text'),start=text.labels.get('create:Form1'),end=text.labels.get('control-procedure:Form1:plot');
    assert.ok(Number.isInteger(start)&&end>start);
    jumps=text.fixups.filter(f=>f.offset>=start&&f.offset<end&&f.label==='error:6'&&text.bytes[f.offset-1]===0xe9);
    return linked;
  });
  const result=compileWin32(project,{optimization});assert.deepEqual(project,before);
  assert.equal(jumps.length,0,'a saved fractional value must not compile to an unconditional Long-overflow jump');
  const bytes=Buffer.from(linked.bytes),numbers=Object.entries(linked.symbols).filter(([name])=>/^number:\d+$/.test(name)).map(([,rva])=>{
    const section=linked.sections.find(s=>rva>=s.rva&&rva+8<=s.rva+s.size);assert.ok(section);
    return bytes.readDoubleLE(section.offset+rva-section.rva);
  });
  for(const value of values)assert.ok(numbers.some(n=>Object.is(n,value)),'missing exact Double seed '+String(value));
  assert.ok(result.bytes.length<65536,'used-only chart remains within the basic-control fixture size budget');
});
