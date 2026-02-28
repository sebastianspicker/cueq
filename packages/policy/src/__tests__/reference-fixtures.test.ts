import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import Ajv2020 from 'ajv/dist/2020';
import { describe, expect, it } from 'vitest';

const fixtureSchemaPath = resolve(
  process.cwd(),
  '../../schemas/fixtures/reference-calculation.schema.json',
);
const fixturesDir = resolve(process.cwd(), '../../fixtures/reference-calculations');

async function readJson(filePath: string) {
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw) as Record<string, unknown>;
}

describe('Reference calculation fixtures', () => {
  it('validate against the shared fixture JSON schema', async () => {
    const schema = await readJson(fixtureSchemaPath);
    const ajv = new Ajv2020({ allErrors: true, strict: false });
    const validate = ajv.compile(schema);
    const fixtureFiles = (await readdir(fixturesDir)).filter((file) => file.endsWith('.json'));

    expect(fixtureFiles.length).toBeGreaterThan(0);

    for (const file of fixtureFiles) {
      const fixture = await readJson(resolve(fixturesDir, file));
      const valid = validate(fixture);
      expect(valid, `${file}: ${ajv.errorsText(validate.errors)}`).toBe(true);
    }
  });
});
