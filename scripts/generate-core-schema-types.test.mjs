import assert from 'node:assert/strict';
import test from 'node:test';
import { renderCoreSchemaTypes, schemaToType } from './generate-core-schema-types.mjs';

test('schemaToType is pure across scalar, array, object, and ref shapes', () => {
  const schema = {
    type: 'object',
    required: ['id', 'active'],
    properties: {
      id: { $ref: './_defs/common.schema.json#/$defs/id' },
      active: { type: 'boolean' },
      values: { type: 'array', items: { type: ['number', 'null'] } },
    },
  };
  const before = structuredClone(schema);

  assert.equal(
    schemaToType(schema),
    ['{', '  id: string;', '  active: boolean;', '  values?: (number | null)[];', '}'].join('\n'),
  );
  assert.deepEqual(schema, before);
});

test('renderCoreSchemaTypes is byte-stable for identical ordered input', () => {
  const schemas = [
    { file: 'core-example.schema.json', schema: { title: 'Example', type: 'string' } },
  ];
  assert.equal(renderCoreSchemaTypes(schemas), renderCoreSchemaTypes(structuredClone(schemas)));
});
