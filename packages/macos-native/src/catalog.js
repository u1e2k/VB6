import {MacOSCompileError} from "./target.js";
/** Native macOS controls and API adaptation contracts, not a Windows DLL loader. */

const MACOS_CONTROLS=Object.freeze({
  Form:'NSWindow',MDIForm:'NSWindow',CommandButton:'NSButton',Label:'NSTextField',
  TextBox:'NSTextField/NSTextView',CheckBox:'NSButton',OptionButton:'NSButton',Frame:'NSBox',
  PictureBox:'NSView',Image:'NSImageView',Shape:'NSView',Line:'NSView',
  ListBox:'NSTableView',ComboBox:'NSComboBox',Timer:'NSTimer',HScrollBar:'NSSlider',VScrollBar:'NSSlider',
  ProgressBar:'NSProgressIndicator',Slider:'NSSlider',UpDown:'NSStepper',RichTextBox:'NSTextView',
  DTPicker:'NSDatePicker',MonthView:'NSDatePicker',TabStrip:'NSTabView',SSTab:'NSTabView',
  StatusBar:'NSView',Toolbar:'NSView',TreeView:'NSOutlineView',ListView:'NSTableView',
  MSFlexGrid:'NSTableView',MSHFlexGrid:'NSTableView',DataGrid:'NSTableView',
  CommonDialog:'NSOpenPanel/NSSavePanel',ImageList:'NSImage',MSChart:'NSView',
  DriveListBox:'NSComboBox',DirListBox:'NSTableView',FileListBox:'NSTableView'
});
const signatures={
  kernel32:{Sleep:1,GetTickCount:0,GetCurrentProcessId:0,GetCurrentThreadId:0,GetLastError:0,SetLastError:1,
    Beep:2,GetComputerName:2,GetUserName:2,GetModuleFileName:3,GetModuleHandle:1,GetTempPath:2,GetTempFileName:4,
    GetCurrentDirectory:2,SetCurrentDirectory:1,CreateDirectory:2,RemoveDirectory:1,DeleteFile:1,
    CopyFile:3,MoveFile:2,GetFileAttributes:1,SetFileAttributes:2,GetEnvironmentVariable:3,
    SetEnvironmentVariable:2,QueryPerformanceCounter:1,QueryPerformanceFrequency:1,MulDiv:3},
  user32:{MessageBox:4,MessageBeep:1,GetActiveWindow:0,GetForegroundWindow:0,SetForegroundWindow:1,
    GetFocus:0,SetFocus:1,ShowWindow:2,IsWindow:1,IsWindowVisible:1,IsWindowEnabled:1,EnableWindow:2,
    DestroyWindow:1,GetWindowText:3,GetWindowTextLength:1,SetWindowText:2,MoveWindow:6,SetWindowPos:7,
    GetClientRect:2,GetWindowRect:2,GetDlgCtrlID:1,GetDlgItem:2,SendMessage:4,PostMessage:4,
    GetSystemMetrics:1,GetSysColor:1,GetCursorPos:1,SetCursorPos:2,FindWindow:2,FindWindowEx:4,
    GetParent:1,SetParent:2,InvalidateRect:3,UpdateWindow:1,SetTimer:4,KillTimer:2,
    GetDC:1,ReleaseDC:2,FillRect:3,DrawText:5},
  gdi32:{CreatePen:3,CreateSolidBrush:1,DeleteObject:1,SelectObject:2,MoveToEx:4,LineTo:3,
    Rectangle:5,Ellipse:5,SetPixel:4,GetPixel:3,TextOut:5,SetTextColor:2,SetBkColor:2,SetBkMode:2,
    GetStockObject:1,GetTextExtentPoint32:4},
  shell32:{ShellExecute:6},
  advapi32:{GetUserName:2},
  winmm:{timeGetTime:0}
};
const MACOS_API_SIGNATURES=Object.freeze(Object.fromEntries(Object.entries(signatures).map(([lib,entries])=>[lib,Object.freeze({...entries})])));
function resolveMacOSDeclaration(procedure,module=''){
  const external=procedure.external;
  const library=String(external.library).toLowerCase().replace(/\.dll$/,'');
  const requested=external.entry;const table=MACOS_API_SIGNATURES[library];
  let name=table&&Object.keys(table).find(name=>name.toLowerCase()===requested.toLowerCase());
  let wide=false;
  if(!name&&/[AW]$/i.test(requested)){const base=requested.slice(0,-1);name=table&&Object.keys(table).find(name=>name.toLowerCase()===base.toLowerCase());wide=/W$/i.test(requested);}
  if(!name)throw new MacOSCompileError(`No native macOS adapter for Declare ${procedure.name} Lib "${external.library}" Alias "${requested}"`,module,procedure.line,'MAC210');
  if(procedure.params.length!==table[name])throw new MacOSCompileError(`Declare ${procedure.name} requires ${table[name]} parameters for ${name}`,module,procedure.line,'MAC211');
  const forbidden=procedure.params.find(p=>p.paramArray||p.autoNew||p.bounds?.length||['object','variant'].includes(p.type.toLowerCase()));
  if(forbidden)throw new MacOSCompileError(`Declare parameter ${forbidden.name} requires an explicit native scalar, String, Any buffer, or UDT contract`,module,procedure.line,'MAC212');
  return Object.freeze({library,name,wide,id:`${library}.${name}${wide?'W':''}`});
}
function macOSControlReport(project){
  const used=new Set();
  for(const module of project.modules)if(module.form){
    for(const control of [module.form,...(module.form.controls||[])]){
      const type=control.type||'Form';
      if(!Object.hasOwn(MACOS_CONTROLS,type))throw new MacOSCompileError(`Control ${control.name||module.name} (${type}) has no AppKit implementation`,module.name,1,'MAC220');
      used.add(type);
    }
  }
  return [...used].sort().map(type=>({type,native:MACOS_CONTROLS[type]}));
}

export {MACOS_CONTROLS,MACOS_API_SIGNATURES,resolveMacOSDeclaration,macOSControlReport};
