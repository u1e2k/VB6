import test from 'node:test';import assert from 'node:assert/strict';
import {nativeGridSeed,NATIVE_GRID_FIELDS as F,NATIVE_GRID_TYPES} from '../src/native/control-grid-contract.js';
test('grid seed validates actual cell and dimension bounds without changing authored state',()=>{
 const control={type:'MSFlexGrid',properties:{Rows:3,Cols:2,FixedRows:1,FixedCols:0,GridData:[['A','B'],['x\0y',12]],ColWidths:[0,1800]}},before=JSON.stringify(control),s=nativeGridSeed(control);
 assert.equal(JSON.stringify(control),before);assert.equal(s.fields.row,1);assert.deepEqual(s.widths,[0,1800]);assert.equal(s.cells[2].text,'x\0y');assert.equal(s.cells[3].text,'12');
 assert.equal(Object.values(F).length,new Set(Object.values(F)).size);
});
test('empty native grids and every admitted grid type retain a valid column schema',()=>{for(const type of NATIVE_GRID_TYPES){const s=nativeGridSeed({type,properties:{Rows:0,Cols:3,FixedRows:0,FixedCols:0}});assert.equal(s.fields.rows,0);assert.equal(s.fields.row,0);assert.deepEqual(s.cells,[]);}});
test('native grid refuses oversized, malformed, non-scalar and out-of-range seeds',()=>{
 for(const properties of [{Rows:100002},{Rows:104857,Cols:20},{Rows:-1},{Cols:0},{Rows:2,FixedRows:3},{Cols:2,Col:2},{GridData:[null]},{GridData:[[{}]]},{ColWidths:[-1]},{RowHeights:[NaN]},{SelectionMode:3},{GridLines:7}])assert.throws(()=>nativeGridSeed({type:'DataGrid',properties}),TypeError);
});
