import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { parseCsvRecords } from './hr-import.mjs';

const corpus = JSON.parse(
  await readFile(
    new URL('../../../fixtures/integrations/hr-csv-corpus.json', import.meta.url),
    'utf8',
  ),
);

for (const example of corpus.valid) {
  test(`MJS parser accepts ${example.name}`, () => {
    const row = parseCsvRecords(example.csv).rows[0];
    assert.deepEqual(
      Object.fromEntries(Object.keys(example.expected).map((key) => [key, row[key]])),
      example.expected,
    );
  });
}

for (const example of corpus.invalid) {
  test(`MJS parser rejects ${example.name}`, () => {
    assert.throws(
      () => parseCsvRecords(example.csv),
      (error) => error instanceof Error && error.message.includes(example.error),
    );
  });
}
