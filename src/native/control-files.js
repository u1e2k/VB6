/** File controls enumerate the real Windows namespace without changing process
 * CWD. Unicode paths, bounded buffers and FindClose cover every exit path. */
export const NATIVE_FILE_CONTROLS=new Set(['DriveListBox','DirListBox','FileListBox']);
const mem=memory=>({memory}),arg=argument=>({argument});
export const nativeControlFileMethods={
  createNativeFileControl(control){
    const type=control.model.type,p=control.model.properties,x=this.x;
    if(!NATIVE_FILE_CONTROLS.has(type))return;
    (this.nativeFileFamilies ||= new Set()).add(type);
    if(type==='DriveListBox'){
      x.push(this.string(p.Drive||'C:')).push(mem(control.handle)).call('native:control:drives');
    }else{
      x.push(this.string(p.Path||'.')).call('native:control:full-path').store(control.state);
      x.api('oleaut32.dll','SysAllocString',[this.string(p.Pattern||'*.*')]).test().branch('e','error:7').store(control.state,4);
      x.push({memory:control.state,addend:4}).push(mem(control.state)).push(mem(control.handle)).call('native:control:files:'+type);
    }
  },
  nativeListText(object,index=null){
    const x=this.x,combo=['ComboBox','DriveListBox'].includes(object.model.type),selected=x.unique(),done=x.unique(),buffer=this.buffer();
    if(index)this.numeric(index);else x.api('user32.dll','SendMessageW',[this.controlHandleRef(object),combo?0x147:object.model.type==='ListBox'&&object.model.properties.MultiSelect?0x19f:0x188,0,0]);
    x.test().branch('ns',selected).value(this.string('')).jump(done).label(selected).emit(0x89,0xc3).push(0).emit(0x53).push(combo?0x149:0x18a).push(this.controlHandleRef(object)).invoke('user32.dll','SendMessageW').compare(4095).branch('g','error:7').test().branch('s','error:5');
    x.push(buffer).emit(0x53).push(combo?0x148:0x189).push(this.controlHandleRef(object)).invoke('user32.dll','SendMessageW').value(buffer).label(done).push().invoke('oleaut32.dll','SysAllocString');this.ownString();
  },
  getNativeFileProperty(object,property){
    const type=object.model?.type,x=this.x;
    if(!NATIVE_FILE_CONTROLS.has(type))return false;
    this.ensure(object);
    if(['listindex','listcount'].includes(property)){x.api('user32.dll','SendMessageW',[this.controlHandleRef(object),type==='DriveListBox'?(property==='listindex'?0x147:0x146):(property==='listindex'?0x188:0x18b),0,0]);return true;}
    if(property==='text'||property==='filename'&&type==='FileListBox'||property==='drive'&&type==='DriveListBox'){this.nativeListText(object);return true;}
    if(type!=='DriveListBox'&&(property==='path'||property==='pattern')){this.nativeControlState(object);x.emit(0xff,0x70,property==='path'?0:4).invoke('oleaut32.dll','SysAllocString');this.ownString();return true;}
    return false;
  },
  setNativeFileProperty(object,property,expr){
    const type=object.model?.type,x=this.x;
    if(!NATIVE_FILE_CONTROLS.has(type))return false;
    if(property==='listindex'){this.numeric(expr);x.emit(0x89,0xc3).push(0).emit(0x53).push(type==='DriveListBox'?0x14e:0x186).push(this.controlHandleRef(object)).invoke('user32.dll','SendMessageW');return true;}
    if(property==='drive'&&type==='DriveListBox'){(this.nativeFileFamilies ||=new Set()).add(type);this.textExpression(expr);x.push().push(this.controlHandleRef(object)).call('native:control:drives');return true;}
    if(property==='filename'&&type==='FileListBox'){this.textExpression(expr);x.push().push(-1).push(0x1a2).push(this.controlHandleRef(object)).invoke('user32.dll','SendMessageW').compare(-1).branch('e','error:5').emit(0x89,0xc3).push(0).emit(0x53).push(0x186).push(this.controlHandleRef(object)).invoke('user32.dll','SendMessageW');return true;}
    if(type!=='DriveListBox'&&(property==='path'||property==='pattern')){
      (this.nativeFileFamilies ||=new Set()).add(type);
      this.textExpression(expr);x.push().call(property==='path'?'native:control:full-path':'native:string:copy');this.ownString();
      // Populate from the candidate first. A bad path cannot replace the owned
      // Path/Pattern value; the temporary BSTR is still covered by VB cleanup.
      x.emit(0x89,0xc7);this.nativeControlState(object);x.emit(0x89,0xc6);
      if(property==='pattern')x.emit(0x57,0xff,0x36);else x.emit(0xff,0x76,4,0x57);
      x.push(this.controlHandleRef(object)).call('native:control:files:'+type);
      x.emit(0x57).invoke('oleaut32.dll','SysAllocString').test().branch('e','error:7').emit(0x89,0xc3,0xff,0x76,property==='path'?0:4).invoke('oleaut32.dll','SysFreeString').emit(0x89,0x5e,property==='path'?0:4);
      return true;
    }
    return false;
  },
  nativeFileMethod(object,method,args){
    if(method!=='refresh'||args.length||!NATIVE_FILE_CONTROLS.has(object.model?.type))return false;
    const type=object.model.type,x=this.x;this.ensure(object);(this.nativeFileFamilies ||=new Set()).add(type);
    if(type==='DriveListBox'){this.nativeListText(object);x.push().push(this.controlHandleRef(object)).call('native:control:drives');}
    else{this.nativeControlState(object);x.emit(0xff,0x70,4,0xff,0x30).push(this.controlHandleRef(object)).call('native:control:files:'+type);}
    return true;
  },
  disposeNativeFileControl(control){
    if(!['DirListBox','FileListBox'].includes(control.model.type))return;
    const x=this.x;for(const offset of [0,4])x.push({memory:control.state,addend:offset}).invoke('oleaut32.dll','SysFreeString').value(0).store(control.state,offset);
  },
  emitNativeFileHelpers(){
    if(!this.nativeFileFamilies?.size)return;
    const x=this.x;
    if([...this.nativeFileFamilies].some(t=>t!=='DriveListBox')){
      x.label('native:control:full-path').enter(65536).push(0).local(-65536).push().push(32768).push(arg(8)).invoke('kernel32.dll','GetFullPathNameW').test().branch('e','error:5').compare(32764).branch('a','error:5');
      x.local(-65536).push().invoke('kernel32.dll','GetFileAttributesW').compare(-1).branch('e','error:5').emit(0xa8,16).branch('e','error:5').local(-65536).push().invoke('oleaut32.dll','SysAllocString').test().branch('e','error:7').leave(4);
    }
    for(const type of this.nativeFileFamilies){
      if(type==='DriveListBox')continue;
      const loop=x.unique(),next=x.unique(),done=x.unique(),close=x.unique(),closed=x.unique(),outOfMemory=x.unique(),badRead=x.unique(),failure=x.unique(),pathReady=x.unique();
      // GetFullPathNameW has already checked the path; callers can only pass a
      // known control Path or a newly validated candidate. No SetCurrentDirectory.
      x.label('native:control:files:'+type).enter(66144).push(32768).push(arg(12)).local(-66136).push().invoke('kernel32.dll','lstrcpynW');
      x.local(-66136).push().invoke('kernel32.dll','lstrlenW').compare(32764).branch('a','error:5').emit(0x89,0xc1).local(-66136).emit(0x8d,0x04,0x48,0x66,0x83,0x78,0xfe,92).branch('e',pathReady).emit(0x66,0xc7,0x00,92,0,0x83,0xc0,2).label(pathReady).emit(0xc7,0x00,42,0,0,0);
      x.api('user32.dll','SendMessageW',[arg(8),0x184,0,0]);x.local(-600).push().local(-66136).push().invoke('kernel32.dll','FindFirstFileW').compare(-1).branch('e',failure).emit(0x89,0xc7).local(-600).emit(0x89,0xc6);
      x.label(loop).emit(0x8b,0x06,0xa8,16).branch(type==='DirListBox'?'e':'ne',next);
      x.emit(0x8d,0x5e,44,0x66,0x83,0x3b,46);const notDot=x.unique();x.branch('ne',notDot).emit(0x66,0x83,0x7b,2,0).branch('e',next).emit(0x81,0x7b,2).imm(46).branch('e',next).label(notDot);
      if(type==='FileListBox')x.push(1).push(arg(16)).emit(0x53).invoke('shlwapi.dll','PathMatchSpecExW').test().branch('s',badRead).branch('ne',next);
      x.emit(0x53).push(0).push(0x180).push(arg(8)).invoke('user32.dll','SendMessageW').compare(-2).branch('e',outOfMemory).compare(-1).branch('e',outOfMemory);
      x.label(next).emit(0x56,0x57).invoke('kernel32.dll','FindNextFileW').test().branch('ne',loop).api('kernel32.dll','GetLastError').compare(18).branch('ne',badRead).emit(0x57).invoke('kernel32.dll','FindClose').jump(done);
      x.label(outOfMemory).emit(0x57).invoke('kernel32.dll','FindClose').jump('error:7');x.label(badRead).emit(0x57).invoke('kernel32.dll','FindClose').jump('error:5');
      x.label(failure).api('kernel32.dll','GetLastError').compare(2).branch('e',done).compare(18).branch('ne','error:5');x.label(done).value(0).leave(12);
    }
    if(this.nativeFileFamilies.has('DriveListBox')){
      const loop=x.unique(),done=x.unique(),advance=x.unique(),selected=x.unique();
      x.label('native:control:drives').enter(4096).local(-4096).push().push(2048).invoke('kernel32.dll','GetLogicalDriveStringsW').test().branch('e','error:5').compare(2048).branch('ae','error:5');
      x.api('user32.dll','SendMessageW',[arg(8),0x14b,0,0]);x.local(-4096).emit(0x89,0xc6);
      x.label(loop).emit(0x66,0x83,0x3e,0).branch('e',done).emit(0x56).push(0).push(0x143).push(arg(8)).invoke('user32.dll','SendMessageW').test().branch('s','error:7');
      x.emit(0x56).invoke('kernel32.dll','lstrlenW').emit(0x8d,0x74,0x46,2).jump(loop);
      x.label(done).api('user32.dll','SendMessageW',[arg(8),0x14c,-1,arg(12)]).compare(-1).branch('e','error:5');
      x.label(selected).emit(0x89,0xc3).push(0).emit(0x53).push(0x14e).push(arg(8)).invoke('user32.dll','SendMessageW').leave(8);
    }
  }
};
