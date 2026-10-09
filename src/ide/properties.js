import {themedIndicator} from '../theme/icons.js';
import {resolveApplicationTheme} from '../theme/application-appearance.js';
import {layoutEnabled,layoutDefaults,layoutKey,LAYOUT_CHOICES} from '../layout/contract.js';
import {anchorDialog} from '../layout/designer-tools.js';
import {formatAnchor,parseAnchor} from '../../packages/auto-layout/src/index.js';
import {el} from '../core/core.js';
import {CONTROL_DEFAULTS} from '../project/model.js';
import {colorValue} from '../theme/theme.js';
import {modal,alertDialog,resizeHandle,icon} from './ui.js';
import {oleHex,parsePropertyNumber,showColorPalette,fontDialog} from './property-editors.js';
import {PROPERTY_DESCRIPTIONS_JA} from './i18n.js';
const BOOLS=new Set('LayoutIgnore LayoutClipContents MDIChild Enabled Visible TabStop FontBold FontItalic FontUnderline FontStrikethru Locked MultiLine Default Cancel Sorted Stretch AutoRedraw KeyPreview FullRowSelect GridLines CancelError ControlBox MinButton MaxButton Moveable NegotiateMenus'.split(' '));
const FONTS=['FontName','FontSize','FontBold','FontItalic','FontUnderline','FontStrikethru'];
const DESCRIPTIONS={...PROPERTY_DESCRIPTIONS_JA};
const ENUMS={WindowState:['0 - 通常のウィンドウ','1 - 最小化','2 - 最大化'],Align:['0 - なし','1 - 上揃え','2 - 下揃え','3 - 左揃え','4 - 右揃え'],Appearance:['0 - フラット','1 - 3D'],Alignment:['0 - 左揃え','1 - 右揃え','2 - 中央揃え'],BackStyle:['0 - 透明','1 - 不透明'],ScrollBars:['0 - なし','1 - 水平','2 - 垂直','3 - 両方'],MultiSelect:['0 - なし','1 - 単一','2 - 拡張'],StartUpPosition:['0 - 手動','1 - オーナー フォームの中央','2 - 画面の中央','3 - Windows の規定値'],ScaleMode:['0 - ユーザー定義','1 - Twip','2 - ポイント','3 - ピクセル','4 - 文字','5 - インチ','6 - ミリメートル','7 - センチメートル'],Shape:['0 - 長方形','1 - 正方形','2 - 楕円','3 - 円','4 - 角丸長方形','5 - 角丸正方形'],FillStyle:['0 - 実線','1 - 透明','2 - 水平線','3 - 垂直線','4 - 右上がり斜線','5 - 右下がり斜線','6 - 格子','7 - 斜め格子']};
function enumeration(key,target){if(LAYOUT_CHOICES[key])return LAYOUT_CHOICES[key].map((label,value)=>({value,label}));if(key==='Dock')return ['None','Top','Bottom','Left','Right','Fill'].map((label,value)=>({value,label}));if(key==='LayoutMode')return ['Absolute','Horizontal','Vertical','Wrap'].map((label,value)=>({value,label}));if(key==='LayoutAlign')return ['Start','Center','End','Stretch'].map((label,value)=>({value,label}));if(key==='LayoutJustify')return ['Start','Center','End','SpaceBetween','SpaceAround','SpaceEvenly'].map((label,value)=>({value,label}));if(BOOLS.has(key))return [{value:0,label:'False'},{value:-1,label:'True'}];let labels=ENUMS[key];if(key==='BorderStyle')labels=['Form','MDIForm'].includes(target.type)?['0 - なし','1 - 単一固定','2 - サイズ変更可能','3 - 固定ダイアログ','4 - 固定ツール ウィンドウ','5 - サイズ変更可能ツール ウィンドウ']:['0 - なし','1 - 単一固定'];if(key==='Style'&&target.type==='ComboBox')labels=['0 - ドロップダウン コンボ','1 - シンプル コンボ','2 - ドロップダウン リスト'];if(key==='View'&&target.type==='ListView')labels=['0 - アイコン','1 - 小さいアイコン','2 - リスト','3 - 詳細'];return labels?.map((label,value)=>({value,label}));}
function groupFor(key){if(layoutKey(key))return '配置';if(['Left','Top','Width','Height','ClientWidth','ClientHeight','Index','TabIndex','TabStop','StartUpPosition'].includes(key))return '位置';if(/Font|Color|Caption|Picture|Style|Alignment|Border|Shape|Stretch/.test(key))return '外観';if(['Name','Tag','ToolTipText'].includes(key))return 'その他';if(['Enabled','Visible','Locked','Interval','Default','Cancel','KeyPreview'].includes(key))return '動作';return 'データ';}
export class PropertyInspector {
  constructor(container,ide){
    this.ide=ide;this.mode='alphabetic';this.activeKey='Name';this.collapsed=new Set();this.fontExpanded=false;this.column=46;
    this.object=el('select',{class:'property-object','aria-label':'選択されたオブジェクト'});this.tabs=el('div',{class:'property-tabs',role:'tablist','aria-label':'プロパティの順序'});
    for(const [id,title]of [['alphabetic','アルファベット順'],['categorized','項目別']])this.tabs.append(el('button',{role:'tab',onclick:()=>{this.mode=id;this.render();}},title));
    this.tabs.addEventListener('keydown',e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();this.mode=this.mode==='alphabetic'?'categorized':'alphabetic';this.render();this.tabs.querySelector('[aria-selected=true]').focus();}});
    this.wrapper=el('div',{class:'property-grid-wrapper'});this.grid=el('div',{class:'property-grid',role:'grid','aria-label':'Properties','aria-colcount':2,tabindex:0});this.description=el('div',{class:'property-description'});
    this.columnHandle=el('div',{class:'property-column-resizer'});this.wrapper.append(this.grid,this.columnHandle);
    resizeHandle(this.columnHandle,'x',delta=>{this.column=Math.max(25,Math.min(75,this.column+delta/Math.max(1,this.grid.clientWidth)*100));this.wrapper.style.setProperty('--property-name-width',this.column+'%');},{label:'Property column width',value:()=>this.column,min:25,max:75});
    container.append(this.object,this.tabs,this.wrapper,this.description);this.object.addEventListener('change',()=>this.ide.designer.select(this.object.value==='form'?[]:[this.object.value]));
    this.appearanceAbort=new AbortController();
    const document=ide.root.ownerDocument;
    document.addEventListener('vb-theme-change',()=>this.refreshApplicationColors(),{signal:this.appearanceAbort.signal});
    document.defaultView.addEventListener('pagehide',e=>{if(!e.persisted)this.appearanceAbort.abort();},{signal:this.appearanceAbort.signal});
    this.grid.addEventListener('keydown',e=>this.keydown(e));this.grid.addEventListener('focus',()=>{this.setActive(this.activeKey);});
  }
  render(){
    const module=this.ide.activeModule;if(!module){this.grid.replaceChildren();this.object.replaceChildren();return;}
    const form=module.form,selected=form?(this.ide.designer?.selected()||[]):[];this.targets=form?(selected.length?selected:[form]):[module];
    this.object.replaceChildren(el('option',{value:'form'},module.name+' '+(form?form.type:module.kind)),...(form?.controls||[]).map(c=>el('option',{value:c.id},c.name+' '+c.type+(c.properties.Index!==undefined?' ('+c.properties.Index+')':''))));
    if(selected.length>1)this.object.prepend(el('option',{value:'multiple'},'(複数のコントロール)'));this.object.value=selected.length>1?'multiple':selected.length===1?selected[0].id:'form';
    [...this.tabs.children].forEach((b,i)=>{const active=(i===0?'alphabetic':'categorized')===this.mode;b.classList.toggle('active',active);b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;});
    this.ide.propertyCaption.querySelector('strong').textContent='プロパティ - '+(selected.length>1?'複数のコントロール':selected[0]?.name||module.name);
    const target=this.targets[0],props={Name:target.name,...(target.properties||{})};if(target===form&&form){props.WindowState??=0;if(form.type!=='MDIForm')props.MDIChild??=0;}if(target!==form&&form){props.Index??='';if(['PictureBox','Toolbar','StatusBar'].includes(target.type))props.Align??=0;}if(!form)props.Kind=module.kind;
    if(form&&target!==form&&['TextBox','Label','CheckBox','ComboBox','DTPicker','DataGrid','MSFlexGrid','MSHFlexGrid'].includes(target.type)){props.DataSource??='';props.DataField??='';props.DataMember??='';}
    for(const key of Object.keys(props))if(layoutKey(key))delete props[key];
    if(layoutEnabled(this.ide.project))Object.assign(props,layoutDefaults(target),Object.fromEntries(Object.entries(target.properties||{}).filter(([k])=>Object.hasOwn(layoutDefaults(target),k))));
    let keys=Object.keys(props).filter(key=>!['GridData','ColumnHeaders','ListItems','Nodes','Font'].includes(key));
    if(this.targets.length>1)keys=keys.filter(key=>key!=='Name'&&this.targets.every(t=>Object.hasOwn(t.properties||{},key)||layoutEnabled(this.ide.project)&&Object.hasOwn(layoutDefaults(t),key)));
    const fontKeys=keys.filter(k=>FONTS.includes(k));keys=keys.filter(k=>!FONTS.includes(k));if(fontKeys.length){keys.push('Font');props.Font='(Font)';}
    keys.sort((a,b)=>a==='Name'?-1:b==='Name'?1:a.localeCompare(b));if(this.mode==='categorized')keys.sort((a,b)=>groupFor(a).localeCompare(groupFor(b))||a.localeCompare(b));
    const scroll=this.grid.scrollTop;this.grid.replaceChildren();this.fields=new Map();this.rows=new Map();let group='';
    for(const key of keys){
      if(this.mode==='categorized'&&groupFor(key)!==group){group=groupFor(key);const g=group;const button=el('button',{class:'property-group',role:'row','aria-expanded':!this.collapsed.has(g),onclick:()=>{this.collapsed.has(g)?this.collapsed.delete(g):this.collapsed.add(g);this.render();}},el('span',{class:'tree-toggle'},themedIndicator(this.collapsed.has(g)?'arrow-right':'arrow-down',this.collapsed.has(g)?'+':'−',8)),group);this.grid.append(button);}
      if(this.mode==='categorized'&&this.collapsed.has(group))continue;
      this.grid.append(this.row(key,props[key],target));
      if(key==='Font'&&this.fontExpanded)for(const fontKey of fontKeys)this.grid.append(this.row(fontKey,props[fontKey],target,true));
    }
    this.grid.scrollTop=scroll;this.grid.setAttribute('aria-rowcount',String(this.rows.size));if(!this.rows.has(this.activeKey))this.activeKey=this.rows.keys().next().value;this.setActive(this.activeKey);if(this.ide.controlRegistry?.canEditSelection?.(this.targets))this.grid.append(el('button',{class:'property-pages-button',onclick:()=>this.ide.showControlPropertyPages().catch(e=>alertDialog(e.message,'コンポーネントのプロパティ'))},'プロパティ ページ…'));this.setReadOnly(this.ide.runState!=='design');
  }
  setActive(key){
    this.activeKey=key;for(const [name,row] of this.rows||[]){const yes=name===key;row.classList.toggle('active',yes);row.setAttribute('aria-selected',String(yes));const field=this.fields.get(name);if(field)field.tabIndex=yes?0:-1;row.querySelectorAll('button').forEach(b=>b.tabIndex=yes?0:-1);}
    const row=this.rows?.get(key);if(row)this.grid.setAttribute('aria-activedescendant',row.id);const label=key==='Name'?'(Name)':key||'';this.description.replaceChildren(el('strong',{},label),this.ide.controlRegistry?.property?.(this.targets?.[0]?.type,key)?.description||DESCRIPTIONS[key]||'Returns or sets the '+label+' property of the selected object.');
  }
  row(key,value,target,child=false){
    const mixed=key!=='Font'&&this.targets.length>1&&!this.targets.every(t=>JSON.stringify(t.properties[key]??(layoutEnabled(this.ide.project)?layoutDefaults(t)[key]:undefined))===JSON.stringify(value)),label=key==='Name'?'(Name)':key;
    const row=el('div',{class:'property-row'+(child?' font-child':''),id:'property-row-'+key,role:'row','data-property':key}),name=el('div',{class:'property-name',role:'gridcell',title:label},label),wrap=el('div',{class:'property-value-editor',role:'gridcell'});
    if(key==='Font'){name.replaceChildren(el('button',{class:'font-expander',title:this.fontExpanded?'Collapse Font':'Expand Font','aria-label':this.fontExpanded?'Collapse Font':'Expand Font','aria-expanded':this.fontExpanded,onclick:e=>{e.stopPropagation();this.fontExpanded=!this.fontExpanded;this.activeKey='Font';this.render();}},themedIndicator(this.fontExpanded?'arrow-down':'arrow-right',this.fontExpanded?'−':'+',8)),'Font');}
    const descriptor=this.ide.controlRegistry?.property?.(target.type,key),propertyReadOnly=this.targets.some(t=>this.ide.controlRegistry?.property?.(t.type,key)?.readOnly);row.dataset.readOnly=propertyReadOnly?'true':'false';const choices=descriptor?.choices||enumeration(key,target),isColor=/Color$/.test(key),isObject=typeof value==='object',format=()=>mixed?'':key==='Anchor'?formatAnchor(value):key==='Font'?'(Font)':Array.isArray(value)?'(List)':isColor?oleHex(value):value===null?'':isObject?'(Resource)':String(value);
    let field;if(choices){field=el('select',{'aria-label':label});if(mixed)field.append(el('option',{value:''},''));for(const choice of choices)field.append(el('option',{value:choice.value},choice.label));field.value=mixed?'':String(BOOLS.has(key)?Number(value)?-1:0:value);if(field.selectedIndex<0){field.append(el('option',{value:String(value)},String(value)));field.value=String(value);}}
    else field=el('input',{'aria-label':label,value:format(),readonly:propertyReadOnly||isObject||key==='Kind'||key==='Font',spellcheck:false});
    field.dataset.property=key;if(mixed)field.setAttribute('aria-description','Multiple different values');
    if(isColor)wrap.append(el('span',{class:'color-swatch',...(mixed?{}:{'data-application-color':value}),style:{background:mixed?'transparent':colorValue(value,'#c0c0c0',this.applicationTheme())}}));
    const editFont=async()=>{const values=await fontDialog(target.properties||{});if(values)this.apply(values);};
    const editText=async()=>{const input=el('textarea',{'aria-label':'Property text',class:'property-text-dialog',value:Array.isArray(value)?value.join('\n'):String(value??'')});const accepted=await modal(label+' - '+target.name,{content:el('div',{},el('p',{},Array.isArray(value)?'Enter one item per line.':'Edit the property value.'),input)});if(accepted)this.ide.setProperty(key,Array.isArray(value)?input.value.split('\n'):input.value);};
    const palette=()=>showColorPalette(wrap,value,n=>this.ide.setProperty(key,n),()=>this.applicationTheme()||'classic');
    const editAnchor=async()=>{const result=await anchorDialog(value,'Anchor - '+(this.targets.length>1?'Multiple Controls':target.name));if(result!==null)this.ide.setProperty('Anchor',result);};
    const editor=propertyReadOnly?null:key==='Anchor'?editAnchor:key==='Font'?editFont:isColor?palette:Array.isArray(value)||['Text','Caption','Tag','ToolTipText'].includes(key)?editText:null;
    if(editor){const button=el('button',{class:'property-edit-button',title:'Edit '+label,'aria-label':'Edit '+label,onclick:editor},isColor?icon('arrow-down',12):'…');wrap.append(field,button);field.addEventListener('keydown',e=>{if(e.altKey&&e.key==='ArrowDown'){e.preventDefault();e.stopPropagation();editor();}});}else wrap.append(field);
    field.addEventListener('focus',()=>this.setActive(key));
    row.addEventListener('pointerdown',e=>{this.setActive(key);if(e.target===name){e.preventDefault();this.grid.focus({preventScroll:true});}});
    name.addEventListener('dblclick',()=>{if(this.readOnly||propertyReadOnly)return;if(choices){const i=choices.findIndex(c=>c.value===Number(value));this.ide.setProperty(key,choices[(i+1)%choices.length].value);}else if(editor)editor();else{field.focus();field.select?.();}});
    field.addEventListener('keydown',e=>{
      if(e.key==='Enter'){e.preventDefault();e.stopPropagation();field.blur();this.grid.focus({preventScroll:true});}
      if(e.key==='Escape'){e.preventDefault();e.stopPropagation();field.dataset.cancel='1';field.value=choices?String(BOOLS.has(key)?Number(value)?-1:0:value):format();field.blur();delete field.dataset.cancel;this.grid.focus({preventScroll:true});}
    });
    field.addEventListener('change',()=>{
      if(field.dataset.cancel){delete field.dataset.cancel;return;}
      if(this.readOnly||propertyReadOnly||field.readOnly||mixed&&field.value==='')return;
      try{let result=key==='Anchor'?parseAnchor(field.value):choices?parsePropertyNumber(field.value):key==='Index'&&!field.value.trim()?undefined:typeof value==='number'||key==='Index'||isColor?parsePropertyNumber(field.value):field.value;if(!mixed&&Object.is(result,value))return;this.ide.setProperty(key,result);}
      catch(error){field.value=choices?String(BOOLS.has(key)?Number(value)?-1:0:value):format();alertDialog(error.message,'Invalid property value');}
    });
    row.append(name,wrap);this.rows.set(key,row);this.fields.set(key,field);return row;
  }
  applicationTheme(){return resolveApplicationTheme(this.ide.project.settings,!!this.ide.root.ownerDocument.defaultView.matchMedia?.('(prefers-color-scheme: dark)').matches).id;}
  refreshApplicationColors(){const theme=this.applicationTheme();for(const swatch of this.grid.querySelectorAll('[data-application-color]'))swatch.style.background=colorValue(swatch.dataset.applicationColor,'#c0c0c0',theme);}
  apply(values){if(this.ide.setProperties)this.ide.setProperties(values);else for(const [k,v] of Object.entries(values))this.ide.setProperty(k,v);}
  keydown(e){
    if(e.defaultPrevented)return;const typing=e.target.matches('input,select,textarea'),keys=[...this.rows.keys()];let index=Math.max(0,keys.indexOf(this.activeKey));
    if(e.ctrlKey&&e.shiftKey&&e.key.length===1){const candidates=keys.map((k,i)=>({k,i})).filter(v=>v.k.toLowerCase().startsWith(e.key.toLowerCase()));index=(candidates.find(v=>v.i>index)||candidates[0])?.i??index;}
    else if(!typing){if(['ArrowDown','ArrowRight'].includes(e.key))index++;else if(['ArrowUp','ArrowLeft'].includes(e.key))index--;else if(e.key==='Home')index=0;else if(e.key==='End')index=keys.length-1;else if(e.key==='PageDown')index+=Math.max(1,Math.floor(this.grid.clientHeight/17)-1);else if(e.key==='PageUp')index-=Math.max(1,Math.floor(this.grid.clientHeight/17)-1);else if(e.key==='Enter'||e.key==='F2'){e.preventDefault();this.fields.get(this.activeKey)?.focus();this.fields.get(this.activeKey)?.select?.();return;}else if(e.key.length===1&&!e.ctrlKey&&!e.altKey){const field=this.fields.get(this.activeKey);if(field&&!field.readOnly&&!field.disabled&&field.tagName==='INPUT'){field.focus();field.select();}return;}else return;}
    else return;
    e.preventDefault();e.stopPropagation();this.setActive(keys[Math.max(0,Math.min(keys.length-1,index))]);this.rows.get(this.activeKey)?.scrollIntoView({block:'nearest'});this.grid.focus({preventScroll:true});
  }
  setReadOnly(value){this.readOnly=!!value;for(const field of this.grid.querySelectorAll('input,select,button'))field.disabled=!!value||field.closest('[data-read-only=true]')!==null;}
}
