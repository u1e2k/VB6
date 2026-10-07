import test from 'node:test';
import assert from 'node:assert/strict';
import {commonBoundProject} from './fixtures/common-bound-project.js';
import {normalizeProject} from '../src/project/model.js';
import {compileProject} from '../src/language/compiler.js';
import {createApplicationExporter} from '../src/exporter/application-exporter.js';
test('bound common-data fixture is a valid saved project with canonical service definitions',()=>{
 const project=normalizeProject(commonBoundProject('http://127.0.0.1:4000'));
 assert.deepEqual(compileProject(project).diagnostics,[]);
 assert.equal(project.dataSources.connections[0].url,'http://127.0.0.1:4000/api/');
 assert.equal(project.dataSources.commands[0].text,'binding/{round}.json');
 assert.equal(project.dataSources.commands[0].parameters[0].required,true);
 assert(project.modules[0].form.controls.some(c=>c.type==='DataGrid'));
});
test('both exporter formats accept the same bound common-data project',()=>{
 const project=commonBoundProject('http://127.0.0.1:4000'),before=JSON.stringify(project);
 const exporter=createApplicationExporter({runtimeSource:'/* fixture payload, no execution claim */',runtimeCSS:''});
 assert.match(exporter.html(project,{persist:false}),/DataEnvironment/);
 const output=exporter.files(project,{persist:false});assert(output.files['runtime.js']);assert(output.files['bootstrap.js']);
 assert.equal(JSON.stringify(project),before);
});
