import test from 'node:test';
import assert from 'node:assert/strict';
import {MdiHost} from '../src/ide/mdi.js';

function realm(){
  let next=0;const frames=new Map(),cancelled=[];
  return {frames,cancelled,requestAnimationFrame(fn){const id=next++;frames.set(id,fn);return id;},cancelAnimationFrame(id){cancelled.push(id);frames.delete(id);},flush(){const current=[...frames.values()];frames.clear();for(const fn of current)fn();}};
}
function host(){
  const view=realm(),host=Object.create(MdiHost.prototype),layouts=[];
  Object.assign(host,{reflowFrame:null,node:{ownerDocument:{defaultView:view}},windows:new Map([['one',{}]]),layout(win){layouts.push(win);}});
  return {view,host,layouts};
}
test('MDI observer delivery coalesces without layout writes, including frame ID zero',()=>{
  const {view,host:h,layouts}=host();for(let i=0;i<100;i++)h.scheduleReflow();
  assert.equal(layouts.length,0);assert.equal(view.frames.size,1);assert.equal(h.reflowFrame,0);
  view.flush();assert.equal(layouts.length,1);assert.equal(h.reflowFrame,null);assert.equal(view.frames.size,0);
});
test('explicit MDI layout stays synchronous and cancels a redundant observer frame',()=>{
  const {view,host:h,layouts}=host();h.scheduleReflow();h.reflow();
  assert.equal(layouts.length,1);assert.deepEqual(view.cancelled,[0]);view.flush();assert.equal(layouts.length,1);
});
test('MDI reflow uses the current owner window and releases a stale frame',()=>{
  const {view,host:h,layouts}=host(),other=realm();h.scheduleReflow();h.node.ownerDocument.defaultView=other;h.scheduleReflow();
  assert.equal(view.frames.size,0);assert.equal(other.frames.size,1);view.flush();assert.equal(layouts.length,0);other.flush();assert.equal(layouts.length,1);
});
test('MDI disposal cancels observer work without late layout or rescheduling',()=>{
  const {view,host:h,layouts}=host();let disconnected=0,removed=0;
  h.observer={disconnect(){disconnected++;}};h.node.remove=()=>removed++;h.clear=()=>h.windows.clear();
  h.scheduleReflow();h.dispose();h.scheduleReflow();view.flush();
  assert.equal(layouts.length,0);assert.equal(view.frames.size,0);assert.equal(disconnected,1);assert.equal(removed,1);
});
test('unchanged MDI layout retains caption SVGs and produces zero style/attribute writes',()=>{
  let writes=0;const h=Object.create(MdiHost.prototype);
  h.node={clientWidth:800,clientHeight:600};
  const win={rect:{x:8,y:8,width:660,height:470},minimized:false,maximized:false,paintedMinimized:false,paintedMaximized:false,node:{style:new Proxy({left:'8px',top:'8px',width:'660px',height:'470px'},{set(o,k,v){writes++;o[k]=v;return true;}}),classList:{toggle(){writes++;}}},maximize:{replaceChildren(){writes++;}},minimize:{replaceChildren(){writes++;}}};
  for(let i=0;i<100;i++)h.layout(win);assert.equal(writes,0);
});
