import test from 'node:test';
import assert from 'node:assert/strict';
import {compileMacOS} from '../packages/macos-native/src/compiler.js';
import {interfaceProject} from '../packages/macos-native/tests/interfaces.mjs';
import {compileProject} from '../src/language/compiler.js';

test('native interfaces lower the shared bound contracts, not guessed private names', () => {
  const project=interfaceProject(),before=JSON.stringify(project);
  const program=compileProject(project);assert.deepEqual(program.diagnostics,[]);
  const bindings=program.modules.get('nativeprovider').interfaceBindings;
  const output=compileMacOS(project).files['main.cpp'];
  for(const [name,contract]of Object.entries(bindings))for(const [key,member]of Object.entries(contract.members)) {
    assert.ok(output.includes(`"${name}"`));
    assert.ok(output.includes(`{"${key}",InterfaceMember{"${member.procedure}"`));
    for(const parameter of member.signature.params)assert.ok(output.includes(`"${parameter.name.toLowerCase()}"`));
  }
  assert.match(output,/InterfaceMember\{"iscale_scale",\{"amount","factor"\}\}/);
  assert.match(output,/InterfaceContract\{"item",/);
  assert.equal(JSON.stringify(project),before);
  assert.equal(compileMacOS(project).files['main.cpp'],output);
});
test('invalid native interface contracts fail in the shared frontend before source generation', () => {
  for(const replacement of ['','Implements MissingContract', 'Implements IScale\nPrivate Function IScale_Scale(ByVal x As String) As Long\nEnd Function']) {
    const project=interfaceProject();project.modules.find(m=>m.name==='NativeProvider').code=replacement||'Implements IScale';
    assert.throws(()=>compileMacOS(project),error=>Array.isArray(error.diagnostics)&&error.diagnostics.some(d=>d.severity==='error'));
  }
});
