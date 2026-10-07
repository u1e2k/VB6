import {finishRuntimeImports} from './runtime-plan.js';
import {CONTROL_DEFAULTS} from '../project/model.js';
import {CONTROL_MAPPINGS} from './registry.js';
import {createContext} from './context.js';
import {key, identifier, vbString, CodeWriter} from './names.js';

const basic=new Set('CommandButton Label TextBox Frame CheckBox OptionButton ComboBox ListBox PictureBox Image HScrollBar VScrollBar Timer Menu'.split(' '));
const boolean=value=>Number(value)!==0&&value!==false?'True':'False';
const integer=value=>String(Math.round(Number(value)||0));
const pixels=value=>integer(Number(value||0)/15);
const common=new Set('Name Left Top Width Height Visible Enabled TabIndex TabStop FontName FontSize FontBold FontItalic FontUnderline FontStrikethrough ForeColor BackColor ToolTipText Tag Index'.split(' '));
const specific=new Set('Caption Text Default Cancel MultiLine ScrollBars MaxLength PasswordChar Locked Alignment Value List ListIndex MultiSelect Sorted Style Interval AutoSize BorderStyle Stretch Min Max SmallChange LargeChange Checked Shortcut WindowList'.split(' '));

export function emitForm(state,module,path) {
  state={...state,generatedFile:path};
  const writer=new CodeWriter(path),context=createContext(state,module),form=module.form,properties=form.properties||{},nodes=[],byName=new Map();
  writer.line('Option Strict On');writer.line('Imports System');writer.line('Imports System.Drawing');writer.line('Imports System.Windows.Forms');writer.runtimeImportStart=writer.lines.length;writer.line();writer.line();writer.line();
  const native=state.options.codeStyle==='native';
  const tooltips=!native||(form.controls||[]).some(control=>control.properties?.ToolTipText)||state.plugins.some(plugin=>plugin.control);
  const components=tooltips||!native||(form.controls||[]).some(control=>['Timer','ImageList'].includes(control.type));
  writer.open('Partial Public Class '+identifier(module.name));
  if(components)writer.line('Private __vbComponents As Global.System.ComponentModel.IContainer');
  if(tooltips)writer.line('Private __vbTips As ToolTip');
  if(form.menus?.length)writer.line('Private __vbMenu As MenuStrip');
  for(const [index,node] of [...(form.controls||[]),...(form.menus||[]).map(n=>({...n,type:'Menu'}))].entries()){
    const extension=context.hook('control',{node,module}),type=extension?.type||CONTROL_MAPPINGS[node.type];
    if(!type){context.add('MIG_CONTROL','No WinForms adapter for '+node.type+' '+node.name);continue;}
    if(!basic.has(node.type)&&!extension)context.add('MIG_CONTROL_PARITY','A visual '+node.type+' mapping exists, but its VB6 object model and data binding require a semantic adapter.');
    const array=node.properties?.Index!==undefined,field=array?'__vbControl'+index:node.name;
    const item={...node,field,type,array,extension};nodes.push(item);
    const list=byName.get(key(node.name))||[];list.push(item);byName.set(key(node.name),list);
    writer.line('Friend WithEvents '+identifier(field)+' As '+type);
  }
  for(const [name,list] of byName)if(list[0].array)writer.line('Friend ReadOnly '+identifier(list[0].name)+' As New Global.System.Collections.Generic.Dictionary(Of Short, '+list[0].type+')()');
  if(components){writer.line();writer.open('Protected Overrides Sub Dispose(disposing As Boolean)');
  writer.open('Try');writer.line('If disposing AndAlso __vbComponents IsNot Nothing Then __vbComponents.Dispose()');writer.close('Finally');writer.indent++;writer.line('MyBase.Dispose(disposing)');writer.close('End Try');writer.close('End Sub');writer.line();}
  writer.line('<Global.System.Diagnostics.DebuggerStepThrough>');writer.open('Private Sub InitializeComponent()');
  if(components)writer.line('__vbComponents = New Global.System.ComponentModel.Container()');if(tooltips)writer.line('__vbTips = New ToolTip(__vbComponents)');writer.line('Me.SuspendLayout()');
  for(const node of nodes){
    const target='Me.'+identifier(node.field);writer.line(target+' = New '+node.type+'('+(['Timer','ImageList'].includes(node.type)?'__vbComponents':'')+')');
    if(node.array)writer.line('Me.'+identifier(node.name)+'.Add('+integer(node.properties.Index)+'S, '+target+')');
  }
  writer.line('Me.AutoScaleDimensions = New SizeF(96.0F, 96.0F)');writer.line('Me.AutoScaleMode = AutoScaleMode.Dpi');
  writer.line('Me.Name = '+vbString(module.name));writer.line('Me.Text = '+vbString(properties.Caption||module.name));
  writer.line('Me.ClientSize = New Size('+pixels(properties.ClientWidth??properties.Width)+', '+pixels(properties.ClientHeight??properties.Height)+')');
  writer.line('Me.StartPosition = FormStartPosition.'+({0:'Manual',1:'CenterParent',2:'CenterScreen',3:'WindowsDefaultLocation'}[properties.StartUpPosition]||'CenterScreen'));
  writer.line('Me.FormBorderStyle = FormBorderStyle.'+({0:'None',1:'FixedSingle',2:'Sizable',3:'FixedDialog',4:'FixedToolWindow',5:'SizableToolWindow'}[properties.BorderStyle]||'Sizable'));
  for(const name of ['KeyPreview','ControlBox','MaxButton','MinButton','ShowInTaskbar'])if(properties[name]!==undefined)writer.line('Me.'+({MaxButton:'MaximizeBox',MinButton:'MinimizeBox'}[name]||name)+' = '+boolean(properties[name]));
  if(form.type==='MDIForm')writer.line('Me.IsMdiContainer = True');
  if(properties.MDIChild){const parent=[...state.compiled.modules.values()].find(m=>m.form?.type==='MDIForm');if(parent)writer.line('Me.MdiParent = '+context.runtime('VbForms.GetInstance')+'(Of '+identifier(parent.name)+')()');}
  if(properties.ScaleMode!==undefined&&Number(properties.ScaleMode)!==1)context.add('MIG_SCALE_MODE','Form coordinate scaling other than twips requires a drawing/coordinate adapter.');
  font('Me',properties);colors('Me',properties);
  for(const node of nodes){
    const p=node.properties||{},target='Me.'+identifier(node.field);
    if(node.extension){for(const statement of node.extension.initialization||[])writer.line(statement);continue;}
    if(node.type==='Timer'){
      writer.line(target+'.Interval = '+Math.max(1,Number(p.Interval)||1));writer.line(target+'.Enabled = '+(Number(p.Interval)===0?'False':boolean(p.Enabled)));continue;
    }
    writer.line(target+'.Name = '+vbString(node.name));
    if(node.type==='ToolStripMenuItem'){
      writer.line(target+'.Text = '+vbString(p.Caption||node.name));writer.line(target+'.Checked = '+boolean(p.Checked||0));
      for(const name of ['Enabled','Visible'])if(p[name]!==undefined)writer.line(target+'.'+name+' = '+boolean(p[name]));
      if(p.Shortcut)context.add('MIG_MENU_SHORTCUT','Menu shortcut requires a verified VB6-to-Keys mapping: '+node.name);
      continue;
    }
    writer.line(target+'.Location = New Point('+pixels(p.Left)+', '+pixels(p.Top)+')');writer.line(target+'.Size = New Size('+pixels(p.Width)+', '+pixels(p.Height)+')');
    for(const name of ['Visible','Enabled','TabStop'])if(p[name]!==undefined)writer.line(target+'.'+name+' = '+boolean(p[name]));
    if(p.TabIndex!==undefined)writer.line(target+'.TabIndex = '+integer(p.TabIndex));
    if(p.Caption!==undefined||p.Text!==undefined)writer.line(target+'.Text = '+vbString(p.Caption??p.Text));
    if(p.Tag!==undefined)writer.line(target+'.Tag = '+vbString(p.Tag));
    font(target,p);colors(target,p);
    if(p.ToolTipText)writer.line('__vbTips.SetToolTip('+target+', '+vbString(p.ToolTipText)+')');
    if(node.type==='TextBox'){
      writer.line(target+'.Multiline = '+boolean(p.MultiLine||0));writer.line(target+'.ReadOnly = '+boolean(p.Locked||0));
      writer.line(target+'.MaxLength = '+integer(p.MaxLength||0));writer.line(target+'.TextAlign = HorizontalAlignment.'+(['Left','Right','Center'][Number(p.Alignment)]||'Left'));
      if(p.PasswordChar)writer.line(target+'.PasswordChar = '+vbString(String(p.PasswordChar).slice(0,1))+'c');
      if(p.ScrollBars)writer.line(target+'.ScrollBars = CType('+integer(p.ScrollBars)+', ScrollBars)');
    }
    if(node.type==='Label'){writer.line(target+'.AutoSize = '+boolean(p.AutoSize||0));writer.line(target+'.TextAlign = ContentAlignment.'+(['TopLeft','TopRight','TopCenter'][Number(p.Alignment)]||'TopLeft'));}
    if(node.type==='CheckBox'){writer.line(target+'.ThreeState = True');writer.line(target+'.CheckState = CType('+integer(p.Value||0)+', CheckState)');}
    if(node.type==='RadioButton')writer.line(target+'.Checked = '+boolean(p.Value||0));
    if(node.type==='Button'){
      if(Number(p.Default))writer.line('Me.AcceptButton = '+target);if(Number(p.Cancel))writer.line('Me.CancelButton = '+target);
    }
    if(['ListBox','ComboBox'].includes(node.type)){
      if(node.type==='ComboBox')writer.line(target+'.DropDownStyle = ComboBoxStyle.'+({0:'DropDown',1:'Simple',2:'DropDownList'}[p.Style]||'DropDown'));
      if(node.type==='ListBox')writer.line(target+'.SelectionMode = SelectionMode.'+({0:'One',1:'MultiSimple',2:'MultiExtended'}[p.MultiSelect]||'One'));
      writer.line(target+'.Sorted = '+boolean(p.Sorted||0));
      if(Array.isArray(p.List))for(const item of p.List)writer.line(target+'.Items.Add('+vbString(item)+')');
      else if(p.List)context.add('MIG_LIST_RESOURCE','List resource has not been decoded into string items: '+node.name);
      if(p.ListIndex!==undefined)writer.line(target+'.SelectedIndex = '+integer(p.ListIndex));
    }
    if(['HScrollBar','VScrollBar'].includes(node.type)){
      for(const [old,name] of [['Min','Minimum'],['Max','Maximum'],['SmallChange','SmallChange'],['LargeChange','LargeChange'],['Value','Value']])if(p[old]!==undefined)writer.line(target+'.'+name+' = '+integer(p[old]));
      if(p.LargeChange>1)context.add('MIG_SCROLL_RANGE','WinForms scroll-bar effective maximum differs when LargeChange exceeds one.');
    }
    if(node.type==='PictureBox')writer.line(target+'.SizeMode = PictureBoxSizeMode.'+(p.Stretch?'StretchImage':'Normal'));
    for(const [name,value] of Object.entries(p)){
      if(common.has(name)||specific.has(name))continue;
      const defaultValue=CONTROL_DEFAULTS[node.type]?.[name];
      if(value===undefined||value===null||value===''||value===0||value===false||JSON.stringify(value)===JSON.stringify(defaultValue))continue;
      context.add('MIG_CONTROL_PROPERTY','Unmapped property '+node.name+'.'+name+' is retained in originals.');
    }
  }
  for(const node of nodes){
    if(node.type==='Timer'||node.type==='ImageList'||node.type==='ToolStripMenuItem')continue;
    const parents=node.parent?byName.get(key(node.parent)):null;
    if(node.parent&&(!parents||parents.length!==1)){context.add('MIG_CONTROL_PARENT','Unresolved or ambiguous parent '+node.parent+' for '+node.name);continue;}
    const parent=parents?'Me.'+identifier(parents[0].field):'Me';writer.line(parent+'.Controls.Add(Me.'+identifier(node.field)+')');
  }
  if(form.menus?.length){
    writer.line('__vbMenu = New MenuStrip()');writer.line('Me.MainMenuStrip = __vbMenu');
    for(const node of nodes.filter(n=>n.type==='ToolStripMenuItem')){
      const parent=node.parent?byName.get(key(node.parent))?.[0]:null;
      writer.line((parent?'Me.'+identifier(parent.field)+'.DropDownItems':'__vbMenu.Items')+'.Add(Me.'+identifier(node.field)+')');
    }
    writer.line('Me.Controls.Add(__vbMenu)');
  }
  const adapters=[];
  for(const proc of module.procedures.values()){
    if(proc.kind!=='sub')continue;
    let source,event,indexPrefix=[];
    const match=/^(Form|MDIForm)_(.+)$/i.exec(proc.name);
    if(match){source={name:'Me',field:'Me',type:'Form'};event=match[2];if(key(event)==='initialize')continue;if(key(event)==='unload'&&[...module.procedures.values()].some(p=>/^(Form|MDIForm)_QueryUnload$/i.test(p.name)))continue;}
    else{
      const candidates=nodes.filter(n=>key(proc.name).startsWith(key(n.name)+'_')).sort((a,b)=>b.name.length-a.name.length);
      if(!candidates.length)continue;source=candidates[0];event=proc.name.slice(source.name.length+1);
    }
    const sources=source.field==='Me'?[source]:byName.get(key(source.name));
    for(const control of sources){
      const adapter=eventAdapter(proc,event,control,context,adapters.length);
      if(!adapter)continue;
      if(adapter.lines.length)adapters.push(adapter);
      writer.line('AddHandler '+(control.field==='Me'?'Me':'Me.'+identifier(control.field))+'.'+adapter.event+', AddressOf '+adapter.name);
    }
  }
  writer.line('Me.ResumeLayout(False)');writer.line('Me.PerformLayout()');writer.close('End Sub');writer.line();
  for(const adapter of adapters){for(const text of adapter.lines)writer.line(text);writer.line();}
  writer.close('End Class');
  return finishRuntimeImports(writer,context);
  function font(target,p){
    const styles=[p.FontBold?'FontStyle.Bold':null,p.FontItalic?'FontStyle.Italic':null,p.FontUnderline?'FontStyle.Underline':null,p.FontStrikethrough?'FontStyle.Strikeout':null].filter(Boolean);
    writer.line(target+'.Font = New Font('+vbString(p.FontName||'Microsoft Sans Serif')+', '+(Number(p.FontSize)||8.25)+'F, '+(styles.join(' Or ')||'FontStyle.Regular')+', GraphicsUnit.Point)');
  }
  function colors(target,p){for(const name of ['ForeColor','BackColor'])if(p[name]!==undefined)writer.line(target+'.'+name+' = '+(context.options.codeStyle==='native'?'Global.System.Drawing.ColorTranslator.FromOle':context.runtime('VbForms.OleColor'))+'('+integer(p[name])+')');}
}
function eventAdapter(proc,event,control,context,index) {
  const k=key(event),name='__vbEvent'+index,lines=[],array=control.array?[integer(control.properties.Index)+'S']:[],target=control.field==='Me'?'Me':'Me.'+identifier(control.field);
  let netEvent={load:'Load',activate:'Activated',deactivate:'Deactivate',resize:'Resize',click:'Click',dblclick:'DoubleClick',gotfocus:'GotFocus',lostfocus:'LostFocus',timer:'Tick',change:control.type==='ListBox'?'SelectedIndexChanged':'TextChanged',scroll:'Scroll',paint:'Paint',unload:'FormClosing',queryunload:'FormClosing',keydown:'KeyDown',keyup:'KeyUp',keypress:'KeyPress',mousedown:'MouseDown',mouseup:'MouseUp',mousemove:'MouseMove'}[k];
  if(!netEvent){context.add('MIG_EVENT','No event adapter for '+proc.name);return null;}
  if(control.type==='ListBox'&&k==='click')netEvent='SelectedIndexChanged';
  if(control.type==='CheckBox'&&k==='click')netEvent='CheckStateChanged';
  if(control.type==='RadioButton'&&k==='click')netEvent='CheckedChanged';
  let args=[...array],type='EventArgs',before=[],after=[];
  if(control.type==='RadioButton'&&k==='click')before.push('If Not '+target+'.Checked Then Return');
  if(['keydown','keyup'].includes(k)){type='KeyEventArgs';before=['Dim code As Short = CShort(e.KeyCode)','Dim shift As Short = VbForms.ShiftState()'];args.push('code','shift');after=['If code = 0 Then','    e.SuppressKeyPress = True','    e.Handled = True','End If'];}
  else if(k==='keypress'){type='KeyPressEventArgs';before=['Dim code As Short = CShort(AscW(e.KeyChar))'];args.push('code');after=['e.Handled = (code = 0)','If code <> 0 Then e.KeyChar = ChrW(code)'];}
  else if(['mousedown','mouseup','mousemove'].includes(k)){type='MouseEventArgs';before=['Dim button As Short = VbForms.MouseButton(e.Button)','Dim shift As Short = VbForms.ShiftState()','Dim x As Single = VbForms.PixelsToTwips('+target+', e.X)','Dim y As Single = VbForms.PixelsToTwips('+target+', e.Y)'];args.push('button','shift','x','y');}
  else if(k==='unload'||k==='queryunload'){type='FormClosingEventArgs';before=['Dim cancel As Short = If(e.Cancel, CShort(1), CShort(0))'];args.push('cancel');after=['e.Cancel = (cancel <> 0)'];if(k==='queryunload'){before.push('Dim mode As Short = CShort(If(e.CloseReason = CloseReason.WindowsShutDown, 2, If(e.CloseReason = CloseReason.TaskManagerClosing, 3, If(e.CloseReason = CloseReason.MdiFormClosing, 4, If(e.CloseReason = CloseReason.FormOwnerClosing, 5, If(e.CloseReason = CloseReason.UserClosing, 0, 1))))))');args.push('mode');context.add('MIG_UNLOAD_REASON','QueryUnload modes beyond direct close require an application-lifecycle adapter.','warning');}}
  else if(k==='paint')type='PaintEventArgs';
  if(k==='queryunload'){
    const unload=[...context.module.procedures.values()].find(p=>/^(Form|MDIForm)_Unload$/i.test(p.name));
    if(unload){if(unload.params.length!==1)context.add('MIG_EVENT_SIGNATURE','Unload expects one Cancel parameter.');else after.unshift('If cancel = 0 Then '+identifier(unload.name)+'(cancel)');}
  }
  if(proc.params.length!==args.length){context.add('MIG_EVENT_SIGNATURE','Event signature does not match adapter: '+proc.name);return null;}
  if(['keydown','keyup'].includes(k))context.runtime('VbForms.ShiftState');
  if(['mousedown','mouseup','mousemove'].includes(k)){context.runtime('VbForms.ShiftState');context.runtime('VbForms.MouseButton');context.runtime('VbForms.PixelsToTwips');}
  if(context.options.codeStyle==='native'&&!args.length&&!before.length&&!after.length)return {name:identifier(proc.name),event:netEvent,lines:[]};
  lines.push('Private Sub '+name+'(sender As Object, e As '+type+')',...before.map(l=>'    '+l),'    '+identifier(proc.name)+'('+args.join(', ')+')',...after.map(l=>'    '+l),'End Sub');
  return {name,event:netEvent,lines};
}
