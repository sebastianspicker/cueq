import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCsvRecords } from '../common/csv/parse-csv.js';

const corpus = JSON.parse(
  readFileSync(resolve(process.cwd(), '../../fixtures/integrations/hr-csv-corpus.json'), 'utf8'),
) as {
  valid: Array<{ name: string; csv: string; expected: Record<string, string> }>;
  invalid: Array<{ name: string; csv: string; error: string }>;
};

describe('shared HR CSV corpus at the TypeScript boundary', () => {
  for (const example of corpus.valid) {
    it(`parses ${example.name}`, () => {
      expect(parseCsvRecords(example.csv).rows[0]).toMatchObject(example.expected);
    });
  }
  for (const example of corpus.invalid) {
    it(`rejects ${example.name}`, () => {
      expect(() => parseCsvRecords(example.csv)).toThrow(example.error);
    });
  }
});
