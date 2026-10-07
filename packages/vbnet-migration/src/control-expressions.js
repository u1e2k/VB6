import {keyOf, identifier, vbString} from './contracts.js';
import {DEFAULT_MEMBERS, SIMPLE_CONTROL_MEMBERS} from './control-catalog.js';

export function controlSymbol(node, context) {
  if (!node) return null;
  if (node.kind === 'id') {
    if (keyOf(node.name) === 'me' && context.module.kind === 'form') return {type: context.module.input.form?.type || 'Form', self: true};
    const symbol = context.resolve(node.name); if (symbol?.category === 'control') return symbol;
    const form = context.modules.find(m => keyOf(m.name) === keyOf(node.name) && m.kind === 'form');
    if (form) return {type: form.input.form?.type || 'Form', form};
  }
  if (node.kind === 'call') { const symbol = controlSymbol(node.callee, context); if (symbol?.controlArray) return {...symbol, controlArray: false, element: true}; }
  return null;
}
export function controlMember(node, context, emit, value) {
  const symbol = controlSymbol(node.object, context); if (!symbol) return undefined;
  const key = keyOf(node.name), receiver = emit(node.object, {object: true}), write = value !== undefined;
  const use = () => context.use('forms');
  if (['left', 'top', 'width', 'height', 'scalewidth', 'scaleheight', 'scaleleft', 'scaletop', 'clientwidth', 'clientheight'].includes(key)) {
    use(); const kind = vbString(key), scale = Number(context.module.input.form?.properties?.ScaleMode || 1);
    return write ? `Global.Vb6Migration.Runtime.VbForms.SetGeometry(${receiver}, ${kind}, ${value}, ${scale})` : `Global.Vb6Migration.Runtime.VbForms.Geometry(${receiver}, ${kind}, ${scale})`;
  }
  let member;
  if (key === 'value' && symbol.type === 'CheckBox') member = 'CheckState';
  else if (key === 'value' && symbol.type === 'OptionButton') member = 'Checked';
  else if (key === 'value' && symbol.type === 'CommandButton') {
    if (write) { use(); return `Global.Vb6Migration.Runtime.VbForms.ButtonValue(${receiver}, ${value})`; }
    return 'False';
  } else if (key === 'text' && symbol.type === 'ListBox') { use(); return write ? `Global.Vb6Migration.Runtime.VbForms.SetListText(${receiver}, ${value})` : `Global.Vb6Migration.Runtime.VbForms.ListText(${receiver})`; }
  else if (key === 'hwnd') return write ? context.error('VBM4002', 'hWnd is read-only.') && '' : `${receiver}.Handle.ToInt32()`;
  else if (key === 'backcolor' || key === 'forecolor') {
    const property = key === 'backcolor' ? 'BackColor' : 'ForeColor';
    return write ? `${receiver}.${property} = Global.System.Drawing.ColorTranslator.FromOle(CInt(${value}))` : `Global.System.Drawing.ColorTranslator.ToOle(${receiver}.${property})`;
  } else if (key.startsWith('font')) {
    const font = {fontname: 'Name', fontsize: 'SizeInPoints', fontbold: 'Bold', fontitalic: 'Italic', fontunderline: 'Underline', fontstrikethrough: 'Strikeout'}[key];
    if (font) { use(); return write ? `Global.Vb6Migration.Runtime.VbForms.SetFont(${receiver}, ${vbString(font)}, ${value})` : `${receiver}.Font.${font}`; }
  } else member = SIMPLE_CONTROL_MEMBERS[key];
  if (member) {
    if (write && key === 'value' && symbol.type === 'CheckBox') return `${receiver}.${member} = CType(CInt(${value}), Global.System.Windows.Forms.CheckState)`;
    if (write && key === 'value' && symbol.type === 'OptionButton') return `${receiver}.${member} = CBool(${value})`;
    return write ? `${receiver}.${member} = ${value}` : `${receiver}.${member}`;
  }
  context.error('VBM4001', 'Unmapped ' + symbol.type + ' member: ' + node.name + '. Add a control/expression rule before deploying.');
  return write ? `${receiver}.${identifier(node.name)} = ${value}` : `${receiver}.${identifier(node.name)}`;
}
export function controlCall(node, context, emit) {
  if (node.callee?.kind !== 'member') return undefined;
  const symbol = controlSymbol(node.callee.object, context); if (!symbol) return undefined;
  const receiver = emit(node.callee.object, {object: true}), key = keyOf(node.callee.name), args = node.args.map(a => emit(a));
  const method = {refresh: 'Refresh', setfocus: 'Focus', hide: 'Hide', cls: null}[key];
  if (method) return `${receiver}.${method}(${args.join(', ')})`;
  if (key === 'show') return args.length ? `Global.Vb6Migration.Runtime.VbForms.Show(${receiver}, ${args[0]}${args[1] ? ', ' + args[1] : ''})` : `${receiver}.Show()`;
  if (key === 'move') { context.use('forms'); return `Global.Vb6Migration.Runtime.VbForms.Move(${receiver}, ${Number(context.module.input.form?.properties?.ScaleMode || 1)}, ${args.join(', ')})`; }
  if (['ListBox', 'ComboBox'].includes(symbol.type)) {
    if (key === 'additem') { context.use('forms'); return `Global.Vb6Migration.Runtime.VbForms.AddItem(${receiver}, ${args.join(', ')})`; }
    if (key === 'removeitem') return `${receiver}.Items.RemoveAt(CInt(${args[0]}))`;
    if (key === 'clear') return `${receiver}.Items.Clear()`;
    if (key === 'list') return `CStr(${receiver}.Items(CInt(${args[0]})))`;
    if (key === 'itemdata') { context.use('forms'); return `Global.Vb6Migration.Runtime.VbForms.ItemData(${receiver}, CInt(${args[0]}))`; }
  }
  return undefined;
}
export function controlDefault(node, context, emit) {
  const symbol = controlSymbol(node, context);
  const property = symbol && !symbol.controlArray && DEFAULT_MEMBERS[symbol.type];
  return property ? controlMember({kind: 'member', object: node, name: property}, context, emit) : undefined;
}
