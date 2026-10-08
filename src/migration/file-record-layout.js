import {key} from './names.js';
import {findRecord} from './record-types.js';

export const fileScalars = new Set(['byte','boolean','integer','long','single','double','string','date']);

/** Framework record I/O reflects public instance fields. Reject layouts that
 * contain compatibility storage instead of silently serializing its internals. */
export function frameworkRecordLayout(compiled, module, type, visiting = new Set()) {
  if (fileScalars.has(key(type))) return true;
  const record = findRecord(compiled, module, type);
  if (!record || visiting.has(record.id)) return false;
  visiting.add(record.id);
  const supported = record.fields.every(field => field.bounds == null && !field.autoNew &&
    !field.fixedLengthExpression && frameworkRecordLayout(compiled, record.owner, field.type, visiting));
  visiting.delete(record.id);
  return supported;
}

