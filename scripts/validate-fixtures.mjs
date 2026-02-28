import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';

const root = resolve(import.meta.dirname, '..');
const fixtureSchemaPath = resolve(root, 'schemas/fixtures/reference-calculation.schema.json');
const fixturesDir = resolve(root, 'fixtures/reference-calculations');

async function readJson(filePath) {
  const content = await readFile(filePath, 'utf8');
  return JSON.parse(content);
}

async function main() {
  const schema = await readJson(fixtureSchemaPath);
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);

  const files = (await readdir(fixturesDir)).filter((entry) => entry.endsWith('.json')).sort();

  let failed = false;

  for (const file of files) {
    const fixture = await readJson(resolve(fixturesDir, file));
    const valid = validate(fixture);

    if (!valid) {
      failed = true;
      console.error(`Invalid fixture: ${file}`);
      console.error(ajv.errorsText(validate.errors, { separator: '\n' }));
      continue;
    }

    console.log(`✓ Valid fixture: ${file}`);
  }

  if (failed) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fixture validation failed:', error);
  process.exit(1);
});
