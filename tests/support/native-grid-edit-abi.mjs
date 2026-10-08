/** Explicit User32 mocks around the actual linked EDIT-session instructions.
 * Nested invocations restore the interrupted machine, while retaining memory
 * effects. No mock result counts as actual Windows behavior. */
import assert from 'node:assert/strict';
import {emittedGrid} from './native-grid-abi.mjs';
export function emittedGridEdit(t,optimization=0,events=''){
 const out=emittedGrid(t,'Dim snapshot As String\nG.Row=1\nG.Col=1\nG.TextMatrix(1,1)="original"\nsnapshot=G.TextMatrix(1,1)',optimization,events),{vm,m,state}=out;
 const windows=new Map([[101,{enabled:true}]]),notices=[],sent=[];let next=200,focus=101,validate=null;
 const nested=(name,args)=>{const registers=vm.registers.slice(),flags={...vm.flags},ip=vm.ip;try{return vm.invoke(name,args);}finally{vm.registers.set(registers);vm.flags=flags;vm.ip=ip;}};
 const record=editor=>windows.get(editor)?.data;
 vm.hook('kernel32.dll','SetLastError',1,()=>0);vm.hook('kernel32.dll','GetLastError',0,()=>0);
 vm.hook('user32.dll','IsWindowEnabled',1,([h])=>windows.get(h)?.enabled?1:0);
 vm.hook('user32.dll','IsWindow',1,([h])=>windows.has(h)?1:0);
 vm.hook('user32.dll','GetWindowLongW',2,([h,i])=>{if(h===101&&(i|0)===-21)return state;const w=windows.get(h);return !w?0:(i|0)===-21?w.data||0:(i|0)===-4?w.proc:0;});
 vm.hook('user32.dll','SetWindowLongW',3,([h,i,v])=>{const w=windows.get(h);assert.ok(w);const field=(i|0)===-21?'data':'proc',old=w[field]||0;w[field]=v;return old;});
 vm.hook('user32.dll','GetClientRect',2,([h,p])=>{assert.equal(h,101);[0,0,240,120].forEach((n,i)=>m.write(p+4*i,n));return 1;});
 vm.hook('user32.dll','CreateWindowExW',12,([ex,cls,caption,style,x,y,width,height,parent,id,instance,param])=>{assert.equal(m.utf16(cls),'EDIT');assert.equal(parent,101);const h=next++;windows.set(h,{text:m.utf16(caption),x,y,width,height,proc:0x78000000,data:0,enabled:true,visible:false,selection:[0,0]});return h;});
 vm.hook('user32.dll','GetWindowTextLengthW',1,([h])=>windows.get(h)?.text.length||0);
 vm.hook('user32.dll','GetWindowTextW',3,([h,p,n])=>{const s=(windows.get(h)?.text||'').slice(0,Math.max(0,n-1));for(let i=0;i<s.length;i++)m.write(p+2*i,s.charCodeAt(i),16);if(n)m.write(p+2*s.length,0,16);return s.length;});
 vm.hook('user32.dll','CallWindowProcW',5,()=>0);vm.hook('user32.dll','DefWindowProcW',4,()=>0);
 vm.hook('user32.dll','ShowWindow',2,([h,n])=>{if(windows.has(h))windows.get(h).visible=!!n;return 1;});
 vm.hook('user32.dll','GetFocus',0,()=>focus);
 vm.hook('user32.dll','SetFocus',1,([h])=>{const old=focus;focus=h;if(old>=200&&windows.has(old))nested('control-procedure:Form1:g',[101,0x111,0x2007ffd,old]);return old;});
 vm.hook('user32.dll','DestroyWindow',1,([h])=>{if(!windows.has(h))return 0;if(focus===h){focus=0;nested('control-procedure:Form1:g',[101,0x111,0x2007ffd,h]);}nested('native:grid:edit-procedure',[h,0x82,0,0]);windows.delete(h);return 1;});
 vm.hook('user32.dll','SendMessageW',4,([h,msg,w,l])=>{sent.push({h,msg,w,l});if(h===100&&msg===0x8007){notices.push(w);if(validate&&w===0)return validate(l,nested);return nested('wndproc:Form1',[h,msg,w,l]);}if(h===101&&msg===0x8006)return nested('control-procedure:Form1:g',[h,msg,w,l]);const edit=windows.get(h);if(h>=200&&edit){if(msg===0xb1)edit.selection=[w|0,l|0];if(msg===0xc5)edit.limit=w;if(msg===0x102){edit.text=edit.selection[0]===0&&edit.selection[1]===-1?String.fromCharCode(w):edit.text+String.fromCharCode(w);edit.selection=[edit.text.length,edit.text.length];}}return 0;});
 vm.invoke('proc:Form1:Form_Load');
 const begin=(character=0)=>{vm.invoke('native:grid:edit-begin',[101,character]);return m.read(state+108);};
 const finish=(editor,commit=1,refocus=1)=>vm.invoke('native:grid:edit-finish',[editor,commit,refocus]);
 return {...out,windows,sent,notices,nested,begin,finish,record,focus:()=>focus,validation:fn=>{validate=fn;},text:()=>{const b=out.invoke('GetText',[...out.args,1,1]);const s=m.bstr(b);if(b)m.free(b-4);return s;}};
}
