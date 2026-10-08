import {fileScalars as scalars, frameworkRecordLayout} from './file-record-layout.js';
import {key, identifier, CodeWriter} from './names.js';
import {findRecord} from './record-types.js';
import {expression} from './expressions.js';

const fileSystem = 'Global.Microsoft.VisualBasic.FileSystem.';
function helper(context, id, type, currency = false) {
  const name = '__vbFileGet_' + id;
  if (context.fileAdapters.has(name)) return name;
  const writer = new CodeWriter('');
  // VB FileSystem channels are keyed by the calling assembly. Keep these small
  // adapters in the application's module, not the shared compatibility DLL.
  writer.open('Private ' + (context.module.kind === 'module' ? '' : 'Shared ') + 'Sub ' + identifier(name) +
    '(ByVal fileNumber As Integer, ByVal recordNumber As Long, ByRef value As ' + type + ')');
  if (currency) {
    writer.line('Dim raw As Long');
    writer.line(fileSystem + 'FileGet(fileNumber, raw, recordNumber)');
    writer.line('value = ' + context.runtime('VbCurrency.FromDecimal') + '(CDec(raw) / 10000D)');
  } else {
    writer.line('Dim boxed As Global.System.ValueType = value');
    writer.open('Try');
    writer.line(fileSystem + 'FileGet(fileNumber, boxed, recordNumber)');
    writer.close('Finally'); writer.indent++;
    writer.line('value = DirectCast(boxed, ' + type + ')');
    writer.close('End Try');
  }
  writer.close('End Sub');
  context.fileAdapters.set(name, writer.toString());
  return name;
}

export function emitFileRecord(op, context, line) {
  if (op.op !== 'fileRecord') return false;
  const symbol = context.resolve(op.target), type = key(context.type(op.target));
  const e = node => expression(node, context);
  const position = op.position ? e(op.position) : '-1';
  const target = expression(op.target, context, {assignment:op.action === 'get', reference:true});
  const array = symbol?.bounds != null;
  if (array || symbol?.fixedLengthExpression || (!scalars.has(type) && type !== 'currency' &&
      !frameworkRecordLayout(context.compiled, context.module, context.type(op.target)))) {
    context.add('MIG_BINARY_LAYOUT', 'Binary Get/Put of this array, Variant, object or record layout requires a verified VB6 binary-layout codec.');
    line("' Unconverted binary layout retained in original source.");
    return true;
  }
  const property = context.resolve(op.target.kind === 'call' ? op.target.callee : op.target);
  if (op.action === 'get' && property?.kind === 'property') {
    context.add('MIG_FILE_REFERENCE', 'Get requires a writable storage location; property accessor copy-back is not a verified file-read reference.');
  }
  const handle = e(op.handle);
  if (type === 'currency') {
    if (context.decimalCurrency) {
      context.add('MIG_BINARY_CURRENCY_MODERNIZATION', 'Decimal modernization changes Currency binary representation; select preserving Currency semantics for legacy files.');
      line("' Currency binary layout requires preserving semantics.");
    } else if (op.action === 'get') {
      line(identifier(helper(context, 'Currency', context.netType('Currency'), true)) + '(' + handle + ', ' + position + ', ' + target + ')');
    } else {
      line(fileSystem + 'FilePut(FileNumber:=' + handle + ', RecordNumber:=' + position + ', Value:=CLng(' + target + '.ToDecimal() * 10000D))');
    }
    return true;
  }
  const record = findRecord(context.compiled, context.module, context.type(op.target));
  if (record && op.action === 'get') {
    line(identifier(helper(context, record.owner.name + '_' + record.name, context.netType(context.type(op.target)))) + '(' + handle + ', ' + position + ', ' + target + ')');
    return true;
  }
  // Named arguments retain VB6's handle/position/storage evaluation order even
  // though the framework API declares Value before RecordNumber.
  line(fileSystem + (op.action === 'get' ? 'FileGet' : 'FilePut') + '(FileNumber:=' + handle +
    ', RecordNumber:=' + position + ', Value:=' + (record ? 'DirectCast(' + target + ', Global.System.ValueType)' : target) +
    (symbol?.fixedLength ? ', StringIsFixedLength:=True' : '') + ')');
  return true;
}

export function emitFileAdapters(writer, context) {
  for (const source of context.fileAdapters.values()) { writer.line(); writer.line(source.trimEnd()); }
}
