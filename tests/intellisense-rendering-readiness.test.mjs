import test from 'node:test';
import assert from 'node:assert/strict';
import {projectWithPassiveReferences} from '../src/editor/reference-metadata.js';
import {SourceEditor} from '../src/editor/editor.js';
import {ExpressionAssistance} from '../src/editor/expression-assistance.js';

test('workspace reference projection retains native and disabled metadata without copying source modules',()=>{
  const project={modules:[{code:'Dim x As Long'}],references:['native-id',{missing:true,typeLibrary:{name:'Lib',enabled:false,types:[]}}],typeLibraries:[{name:'Safe',types:[]}]};
  const saved=projectWithPassiveReferences(project);
  assert.equal(JSON.stringify(saved),JSON.stringify(project));assert.equal(saved.modules,project.modules);
  assert.notEqual(saved.references,project.references);assert.notEqual(saved.typeLibraries,project.typeLibraries);
});
test('autosave rejects callback/accessor/cyclic metadata without executing it or changing the prior snapshot',()=>{
  let calls=0,stored='previous';const bad={name:'Bad',toJSON(){calls++;return {};}};
  const getter={name:'Getter'};Object.defineProperty(getter,'types',{enumerable:true,get(){calls++;return [];}});
  const cycle={};cycle.self=cycle;
  for(const entry of [bad,getter,cycle]){
    const project={typeLibraries:[entry]};assert.throws(()=>{stored=JSON.stringify({project:projectWithPassiveReferences(project)});});
    assert.equal(stored,'previous');assert.equal(calls,0);
  }
  const project={};Object.defineProperty(project,'typeLibraries',{enumerable:true,get(){calls++;return [];}});
  assert.throws(()=>projectWithPassiveReferences(project),/accessors/);assert.equal(calls,0);
});
test('non-enumerable metadata toJSON is removed from the passive storage projection',()=>{
  let calls=0;const library={name:'Safe',types:[]};Object.defineProperty(library,'toJSON',{value(){calls++;return 'not-data';}});
  assert.equal(JSON.stringify(projectWithPassiveReferences({typeLibraries:[library]})),JSON.stringify({typeLibraries:[{name:'Safe',types:[]}]}));assert.equal(calls,0);
});
for(const [name,Prototype] of [['source',SourceEditor.prototype],['expression',ExpressionAssistance.prototype]]){
  test(name+' explicit dismissal cancels pending post-composition assistance',async()=>{
    const editor=Object.create(Prototype);let reopened=0;
    editor.compositionTimer=setTimeout(()=>reopened++,0);editor.compositionMode='members';editor.cancelCompositionAssistance();
    await new Promise(resolve=>setTimeout(resolve,10));assert.equal(reopened,0);assert.equal(editor.compositionTimer,null);assert.equal(editor.compositionMode,null);
  });
}
