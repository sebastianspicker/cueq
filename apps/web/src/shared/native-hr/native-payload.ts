import { localDateTimeInputToIsoInstant } from '../time/datetime-local';

export interface NativeField {
  key: string;
  label?: string;
  type?:
    | 'text'
    | 'number'
    | 'date'
    | 'datetime-local'
    | 'textarea'
    | 'checkbox'
    | 'list'
    | 'numbers'
    | 'json';
  options?: readonly string[];
  nullable?: boolean;
  optional?: boolean;
  defaultValue?: string;
}
function fieldValue(field: NativeField, value: string): unknown {
  if (!value && field.nullable) return null;
  switch (field.type) {
    case 'number':
      return Number(value);
    case 'checkbox':
      return value === 'true';
    case 'datetime-local': {
      const instant = localDateTimeInputToIsoInstant(value);
      if (!instant) throw new Error('Invalid datetime');
      return instant;
    }
    case 'list':
      return value
        .split(/[\n,]/)
        .map((entry) => entry.trim())
        .filter(Boolean);
    case 'numbers':
      return value.split(',').map(Number);
    case 'json':
      return JSON.parse(value);
    default:
      return value;
  }
}
export function nativePayload(fields: NativeField[], values: Record<string, string>) {
  const result: Record<string, unknown> = {};
  for (const field of fields) {
    const value = values[field.key] ?? field.defaultValue ?? '';
    if (!value && field.optional) continue;
    const parsed = fieldValue(field, value);
    const parts = field.key.split('.');
    let target = result;
    for (const part of parts.slice(0, -1)) {
      if (!target[part]) target[part] = {};
      target = target[part] as Record<string, unknown>;
    }
    const last = parts.at(-1);
    if (last) target[last] = parsed;
  }
  return result;
}
