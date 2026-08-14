import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCsvRecords } from './hr-import.mjs';

test('CSV parser preserves quoted fields and removes a BOM from the first header', () => {
  assert.deepEqual(
    parseCsvRecords(
      '\ufeffexternalId,firstName,notes\r\nE-1,"Ada, Lovelace","said ""hello""\nand left"\r\n',
    ),
    {
      headers: ['externalId', 'firstName', 'notes'],
      rows: [
        {
          externalId: 'E-1',
          firstName: 'Ada, Lovelace',
          notes: 'said "hello"\nand left',
        },
      ],
    },
  );
});

test('CSV parser rejects ambiguous headers', () => {
  assert.throws(
    () => parseCsvRecords('externalId,externalId\nE-1,E-1\n'),
    /CSV parse error: duplicate header names are not allowed\./u,
  );
  assert.throws(
    () => parseCsvRecords('externalId,\nE-1,Ada\n'),
    /CSV parse error: header names must be non-empty\./u,
  );
});
