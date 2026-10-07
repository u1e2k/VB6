import {identifier, keyOf, vbString, outputName} from './contracts.js';
import {createEmitContext} from './types.js';
import {CONTROL_TYPES, CONTROL_EVENTS_MAP} from './control-catalog.js';
import {rasterBytes} from '../../../src/project/frx.js';
const WF='Global.System.Windows.Forms.',D='Global.System.Drawing.',R='Global.Vb6Migration.Runtime.';
const nonvisual=new Set(['Timer','ImageList','CommonDialog']);
const knownDefaults=Object.freeze({MousePointer:0,MouseIcon:'',HelpContextID:0,WhatsThisHelpID:0,LinkMode:0,LinkTopic:'',LinkItem:'',DataField:'',DataSource:'',DataMember:'',DragMode:0,OLEDragMode:0,OLEDropMode:0,RightToLeft:0,Appearance:1,Style:0,FontCharset:0,AutoRedraw:0,Negotiate:0,NegotiateMenus:0,MDIChild:0,ScaleLeft:0,ScaleTop:0});
function truth(value){return value?'True':'False';}
function pixels(value){return String(Math.round(Number(value||0)/15));}
function int(value,c,name){const n=Number(value);if(!Number.isFinite(n)||n < -2147483648 || n >2147483647){c.error('VBM4003','Invalid '+name);return '0';}return String(Math.round(n));}
function eventAdapters(module,fields,c){
  const result=[]; let serial=0;
  for(const procedure of module.procedures){
    if(procedure.external)continue;
    const name=keyOf(procedure.name), candidates=[{name:'Form',type:module.input.form.type,field:'Me'},{name:'MDIForm',type:'MDIForm',field:'Me'},...fields];
    const control=candidates.find(item=>name.startsWith(keyOf(item.name)+'_'));
    if(!control)continue;
    const event=name.slice(keyOf(control.name).length+1);
    if(['initialize','terminate'].includes(event))continue;
    const targets=fields.filter(item=>keyOf(item.name)===keyOf(control.name));
    if(!targets.length)targets.push(control);
    for(const target of targets){
      let dotnet=CONTROL_EVENTS_MAP[event],argsType='Global.System.EventArgs',before=[],args=[],after=[];
      if(target.index!==undefined){before.push('Dim index As Short = '+target.index);args.push('index');}
      if(event==='change'&&['ListBox','ComboBox'].includes(target.type))dotnet='SelectedIndexChanged';
      if(event==='click'&&['ListBox','ComboBox'].includes(target.type))dotnet='SelectedIndexChanged';
      if(event==='change'&&['HScrollBar','VScrollBar','Slider','UpDown','DTPicker'].includes(target.type))dotnet='ValueChanged';
      if(['keydown','keyup'].includes(event)){
        argsType=WF+'KeyEventArgs';before.push('Dim keyCode As Short = CShort(e.KeyCode)','Dim shift As Short = '+R+'VbForms.ShiftState()');args.push('keyCode','shift');after.push('If keyCode = 0 Then e.SuppressKeyPress = True');
      }else if(event==='keypress'){
        argsType=WF+'KeyPressEventArgs';before.push('Dim keyAscii As Short = CShort(Global.Microsoft.VisualBasic.Strings.AscW(e.KeyChar))');args.push('keyAscii');after.push('If keyAscii = 0 Then','e.Handled = True','Else','e.KeyChar = Global.Microsoft.VisualBasic.Strings.ChrW(keyAscii)','End If');
      }else if(['mousedown','mouseup','mousemove'].includes(event)){
        argsType=WF+'MouseEventArgs';before.push('Dim button As Short = '+R+'VbForms.MouseButton(e.Button)','Dim shift As Short = '+R+'VbForms.ShiftState()',`Dim x As Single = CSng(e.X * 1440.0 / ${target.field}.DeviceDpi)`,`Dim y As Single = CSng(e.Y * 1440.0 / ${target.field}.DeviceDpi)`);args.push('button','shift','x','y');
        if(Number(module.input.form.properties.ScaleMode||1)!==1)c.error('VBM4010','Mouse events currently require twip coordinates; use an event adapter for another ScaleMode.');
      }else if(event==='queryunload'||event==='unload'){
        dotnet='FormClosing';argsType=WF+'FormClosingEventArgs';before.push('Dim cancel As Short = If(e.Cancel, CShort(-1), CShort(0))');args.push('cancel');
        if(event==='queryunload'){before.push('Dim mode As Short = '+R+'VbForms.UnloadMode(e.CloseReason)');args.push('mode');}
        after.push('e.Cancel = cancel <> 0');
      }else if(event==='validate'){
        dotnet='Validating';argsType='Global.System.ComponentModel.CancelEventArgs';before.push('Dim cancel As Boolean = e.Cancel');args.push('cancel');after.push('e.Cancel = cancel');
      }else if(event==='paint')argsType=WF+'PaintEventArgs';
      if(!dotnet){c.line=procedure.line;c.error('VBM4011','Unmapped event '+procedure.name);continue;}
      if(procedure.params.length!==args.length){c.line=procedure.line;c.error('VBM4012','Event signature mismatch for '+procedure.name);continue;}
      const wrapper=identifier('__vb6_event_'+(++serial));
      result.push(`Private Sub ${wrapper}(sender As Object, e As ${argsType}) Handles ${target.field}.${dotnet}`,...before,`${identifier(procedure.name)}(${args.join(', ')})`,...after,'End Sub');
    }
  }
  return result;
}
export function emitDesigner(module,root){
  const c=createEmitContext(root,module),form=module.input.form,fields=[],declarations=[],init=[],resources=[];
  if(!form){c.error('VBM4000','Form has no designer model');return {code:'',resources};}
  c.use('forms');
  if(form.type==='UserControl')c.error('VBM4020','UserControl lifecycle/export requires a host-control backend.');
  const groups=new Map();
  for(const control of [...form.controls,...form.menus]){const key=keyOf(control.name),group=groups.get(key)||[];group.push(control);groups.set(key,group);}
  let seq=0;
  for(const controls of groups.values()){
    const first=controls[0],array=first.properties.Index!==undefined;
    let type=CONTROL_TYPES[first.type];
    if(!type){c.error('VBM4021','Unmapped control '+first.name+': '+(first.originalType||first.type));type='Panel';}
    if(array)declarations.push(`Friend ReadOnly ${identifier(first.name)} As New Global.System.Collections.Generic.Dictionary(Of Short, ${WF+type})()`);
    for(const control of controls){
      const field=array?identifier('__vb6_control_'+(++seq)):identifier(control.name),index=control.properties.Index;
      const custom=root.registry.dispatch('control',control,{...c,field});
      if(custom!==undefined){declarations.push(...(custom.declarations||[]));init.push(...(custom.initialize||[]));resources.push(...(custom.resources||[]));fields.push({...control,field,index});continue;}
      declarations.push(`Friend WithEvents ${field} As ${WF+type}`);fields.push({...control,field,index});
      init.push(`${field} = New ${WF+type}(${nonvisual.has(control.type)?'__components':''})`);
      if(array)init.push(`${identifier(control.name)}.Add(${index}, ${field})`);
    }
  }
  init.push('SuspendLayout()');
  function properties(node,receiver){
    const props=node.properties||{},isForm=node===form,visual=isForm||!nonvisual.has(node.type)&&node.type!=='Menu';
    const mapped=new Set(['Index','Name','Left','Top','Width','Height','ClientWidth','ClientHeight','FontName','FontSize','FontBold','FontItalic','FontUnderline','FontStrikethrough','FontWeight','FontCharset']);
    if(visual){
      init.push(`${receiver}.Name = ${vbString(node.name)}`);
      if(isForm){init.push(`${receiver}.ClientSize = New ${D}Size(${pixels(props.ClientWidth??props.Width)}, ${pixels(props.ClientHeight??props.Height)})`);init.push('Me.AutoScaleDimensions = New '+D+'SizeF(96.0F, 96.0F)','Me.AutoScaleMode = '+WF+'AutoScaleMode.Dpi');}
      else init.push(`${receiver}.Location = New ${D}Point(${pixels(props.Left)}, ${pixels(props.Top)})`,`${receiver}.Size = New ${D}Size(${pixels(props.Width)}, ${pixels(props.Height)})`);
      if(props.FontName){const style=[props.FontBold&&'Bold',props.FontItalic&&'Italic',props.FontUnderline&&'Underline',props.FontStrikethrough&&'Strikeout'].filter(Boolean).map(s=>D+'FontStyle.'+s).join(' Or ')||D+'FontStyle.Regular';init.push(`${receiver}.Font = New ${D}Font(${vbString(props.FontName)}, ${Number(props.FontSize||8.25)}F, ${style}, ${D}GraphicsUnit.Point)`);}
    }
    for(const [key,value] of Object.entries(props)){
      if(mapped.has(key))continue;
      if(key==='ScaleMode'){if(![1,3].includes(Number(value)))c.error('VBM4022','Designer ScaleMode '+value+' requires a coordinate backend');continue;}
      if(key==='ScaleWidth'||key==='ScaleHeight'){if(Number(props.ScaleMode||1)===0)c.error('VBM4022','Custom ScaleWidth/Height requires a coordinate backend');continue;}
      if(['Caption','Text','Tag'].includes(key)){if(typeof value==='object'){c.error('VBM4023','Unresolved resource '+node.name+'.'+key);continue;}if(!nonvisual.has(node.type))init.push(`${receiver}.${key==='Caption'?'Text':key} = ${vbString(value)}`);continue;}
      if(['Visible','Enabled','TabStop','KeyPreview','Locked','MultiLine','Sorted','FullRowSelect','GridLines'].includes(key)){
        if(!visual&&key!=='Enabled')continue;
        if(!visual&&node.type!=='Timer')continue;
        const property={Locked:'ReadOnly',MultiLine:'Multiline'}[key]||key;
        init.push(`${receiver}.${property} = ${truth(value)}`);continue;
      }
      if(['TabIndex','MaxLength','Interval','SmallChange','LargeChange','TickFrequency','ImageWidth','ImageHeight','Increment'].includes(key)){
        if(!visual&&!['Interval','ImageWidth','ImageHeight'].includes(key))continue;
        if(key==='ImageWidth'||key==='ImageHeight'){if(key==='ImageWidth')init.push(`${receiver}.ImageSize = New ${D}Size(${int(value,c,key)}, ${int(props.ImageHeight||16,c,key)})`);continue;}
        init.push(`${receiver}.${key} = ${int(value,c,key)}`);continue;
      }
      if(key==='Min'||key==='Max'){init.push(`${receiver}.${key==='Min'?'Minimum':'Maximum'} = ${int(value,c,key)}`);continue;}
      if(key==='Value'){
        if(node.type==='CheckBox')init.push(`${receiver}.CheckState = CType(${int(value,c,key)}, ${WF}CheckState)`);
        else if(node.type==='OptionButton')init.push(`${receiver}.Checked = ${truth(value)}`);
        else if(['DTPicker','MonthView'].includes(node.type))init.push(`${receiver}.${node.type==='MonthView'?'SelectionStart':'Value'} = Global.Vb6Migration.Runtime.VbRuntime.DateLiteral(${vbString(value)})`);
        else init.push(`${receiver}.Value = ${int(value,c,key)}`);
        continue;
      }
      if(key==='ForeColor'||key==='BackColor'){if(visual)init.push(`${receiver}.${key} = ${D}ColorTranslator.FromOle(${int(value,c,key)})`);continue;}
      if(key==='ToolTipText'){if(value)init.push(`__toolTip.SetToolTip(${receiver}, ${vbString(value)})`);continue;}
      if(key==='PasswordChar'){if(value)init.push(`${receiver}.PasswordChar = ${vbString(String(value).slice(0,1))}c`);continue;}
      if(key==='Default'||key==='Cancel'){if(value)init.push(`Me.${key==='Default'?'AcceptButton':'CancelButton'} = ${receiver}`);continue;}
      if(key==='StartUpPosition'){init.push(`Me.StartPosition = ${WF}FormStartPosition.${Number(value)===2?'CenterScreen':Number(value)===1?'CenterParent':'Manual'}`);continue;}
      if(key==='BorderStyle'){
        const property=isForm?'FormBorderStyle':'BorderStyle',values=isForm?['None','FixedSingle','Sizable','FixedDialog','FixedToolWindow','SizableToolWindow']:['None','FixedSingle'];
        if(values[Number(value)])init.push(`${receiver}.${property} = ${WF+property}.${values[Number(value)]}`);else c.error('VBM4024','Unknown BorderStyle on '+node.name);continue;
      }
      if(key==='BackStyle'&&node.type==='Label'){if(!value)init.push(`${receiver}.BackColor = ${D}Color.Transparent`);continue;}
      if(key==='Alignment'){
        if(node.type==='Label')init.push(`${receiver}.TextAlign = ${D}ContentAlignment.${['TopLeft','TopRight','TopCenter'][Number(value)]||'TopLeft'}`);
        else if(['TextBox','RichTextBox'].includes(node.type))init.push(`${receiver}.TextAlign = ${WF}HorizontalAlignment.${['Left','Right','Center'][Number(value)]||'Left'}`);
        else if(value)c.error('VBM4024','Unmapped Alignment on '+node.name);continue;
      }
      if(key==='ScrollBars'){if(node.type==='RichTextBox')init.push(`${receiver}.ScrollBars = CType(${int(value,c,key)}, ${WF}RichTextBoxScrollBars)`);else init.push(`${receiver}.ScrollBars = CType(${int(value,c,key)}, ${WF}ScrollBars)`);continue;}
      if(key==='List'){if(Array.isArray(value))for(const item of value)init.push(`${R}VbForms.AddItem(${receiver}, ${vbString(item)})`);else c.error('VBM4023','Unresolved list resource '+node.name);continue;}
      if(key==='ListIndex'){init.push(`${receiver}.SelectedIndex = ${int(value,c,key)}`);continue;}
      if(key==='MultiSelect'){init.push(`${receiver}.SelectionMode = ${WF}SelectionMode.${['One','MultiSimple','MultiExtended'][Number(value)]||'One'}`);continue;}
      if(key==='Style'&&node.type==='ComboBox'){init.push(`${receiver}.DropDownStyle = ${WF}ComboBoxStyle.${['DropDown','Simple','DropDownList'][Number(value)]||'DropDown'}`);continue;}
      if(key==='View'&&node.type==='ListView'){init.push(`${receiver}.View = ${WF}View.${['LargeIcon','SmallIcon','List','Details'][Number(value)]||'Details'}`);continue;}
      if(key==='Stretch'&&['Image','PictureBox'].includes(node.type)){init.push(`${receiver}.SizeMode = ${WF}PictureBoxSizeMode.${value?'StretchImage':'Normal'}`);continue;}
      if(key==='Picture'||key==='Icon'){
        if(!value)continue;
        try{const bytes=rasterBytes(value),resource=outputName(module.name+'_'+node.name+'_'+key)+'.bin';resources.push({path:'Resources/'+resource,bytes,name:resource});init.push(`${receiver}.${key==='Icon'?'Icon':'Image'} = ${R}VbForms.${key==='Icon'?'ResourceIcon':'ResourceImage'}(${vbString(resource)})`);}catch(error){c.error('VBM4023','Image resource cannot be migrated: '+node.name+'.'+key+' ('+error.message+')');}continue;
      }
      if(key==='Checked'&&node.type==='Menu'){init.push(`${receiver}.Checked = ${truth(value)}`);continue;}
      if(key==='Shortcut'&&node.type==='Menu'){if(value)c.error('VBM4025','Menu shortcut requires explicit Keys mapping: '+value);continue;}
      if(Object.hasOwn(knownDefaults,key)&&value===knownDefaults[key])continue;
      if(key==='MDIChild'){if(value)init.push('Me.IsMdiContainer = False');if(value)c.error('VBM4026','MDI child ownership must be supplied by the application host');continue;}
      if(value!==undefined)c.error('VBM4027','Unmapped designer property '+node.name+'.'+key,{property:key,value});
    }
  }
  properties(form,'Me');
  for(const control of fields)properties(control,control.field);
  if(form.type==='MDIForm')init.push('Me.IsMdiContainer = True');
  const menus=fields.filter(c=>c.type==='Menu');
  if(menus.length)init.push('Dim menuStrip As New '+WF+'MenuStrip()','Me.MainMenuStrip = menuStrip','Me.Controls.Add(menuStrip)');
  for(const control of fields){
    if(nonvisual.has(control.type))continue;
    const parent=control.parent?fields.find(p=>keyOf(p.name)===keyOf(control.parent)&&(!control.nativeParentId||p.id===control.nativeParentId)):null;
    if(control.type==='Menu')init.push(`${parent?parent.field+'.DropDownItems':'menuStrip.Items'}.Add(${control.field})`);
    else init.push(`${parent?parent.field:'Me'}.Controls.Add(${control.field})`);
  }
  init.push('ResumeLayout(False)','PerformLayout()');
  root.formEventAdapters.set(keyOf(module.name),eventAdapters(module,fields,c));
  const code=["' WinForms designer generated by @vb6/vbnet-migration",'Option Explicit On','Option Strict On',`Partial Public Class ${identifier(module.name)}`, 'Private __components As New Global.System.ComponentModel.Container()',`Private __toolTip As New ${WF}ToolTip(__components)`,...declarations,'Protected Overrides Sub Dispose(disposing As Boolean)','Try','If disposing Then __components.Dispose()','Finally','MyBase.Dispose(disposing)','End Try','End Sub','Private Sub InitializeComponent()',...init,'End Sub','End Class'].join('\n')+'\n';
  return {code,resources};
}
