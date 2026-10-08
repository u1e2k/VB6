/** Win32 class metadata, not a claim that every VB member is lowered.
 * The compiler must still validate individual properties, events and resources.
 * Keep dependencies per control so an ordinary form never imports comctl32/RichEdit.
 */
const entry = (className, options = {}) => Object.freeze({className, commonControls:0, container:false, ...options});
export const NATIVE_CONTROL_CATALOG = Object.freeze({
  MSChart:entry('STATIC',{kernel:'chart'}),
  MSFlexGrid:entry('STATIC',{kernel:'grid'}), MSHFlexGrid:entry('STATIC',{kernel:'grid'}), DataGrid:entry('STATIC',{kernel:'grid'}),
  CommandButton:entry('BUTTON'), Label:entry('STATIC'), TextBox:entry('EDIT'),
  CheckBox:entry('BUTTON'), OptionButton:entry('BUTTON'), Frame:entry('BUTTON',{container:true}),
  ListBox:entry('LISTBOX'), ComboBox:entry('COMBOBOX'), Timer:entry(null),CommonDialog:entry(null,{nonvisual:true}),ImageList:entry(null,{nonvisual:true}),
  PictureBox:entry('STATIC',{container:true}), Image:entry('STATIC'),
  Shape:entry('STATIC'), Line:entry('STATIC'),
  HScrollBar:entry('SCROLLBAR'), VScrollBar:entry('SCROLLBAR'),
  ProgressBar:entry('msctls_progress32',{commonControls:0x20}),
  Slider:entry('msctls_trackbar32',{commonControls:0x04}),
  UpDown:entry('msctls_updown32',{commonControls:0x10}),
  TreeView:entry('SysTreeView32',{commonControls:0x02}),
  ListView:entry('SysListView32',{commonControls:0x01}),
  StatusBar:entry('msctls_statusbar32',{commonControls:0x04}),
  Toolbar:entry('ToolbarWindow32',{commonControls:0x04}),
  TabStrip:entry('SysTabControl32',{commonControls:0x08,container:true}),
  SSTab:entry('SysTabControl32',{commonControls:0x08,container:true}),
  DTPicker:entry('SysDateTimePick32',{commonControls:0x100}),
  MonthView:entry('SysMonthCal32',{commonControls:0x100}),
  RichTextBox:entry('RICHEDIT50W',{library:'msftedit.dll'}),
  DriveListBox:entry('COMBOBOX'), DirListBox:entry('LISTBOX'), FileListBox:entry('LISTBOX')
});

export function nativeControlDependencies(types) {
  let commonControls = 0;
  const libraries = new Set();
  for (const type of types) {
    const descriptor = NATIVE_CONTROL_CATALOG[type];
    if (!descriptor) throw new TypeError('No Win32 control descriptor: ' + type);
    commonControls |= descriptor.commonControls;
    if (descriptor.library) libraries.add(descriptor.library);
  }
  return Object.freeze({commonControls, libraries:Object.freeze([...libraries].sort())});
}
