import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const root = resolve(import.meta.dirname, '..');
const fixtureSchemaPath = resolve(root, 'schemas/fixtures/reference-calculation.schema.json');
const fixturesDir = resolve(root, 'fixtures/reference-calculations');
const realDerivedFixturesDir = resolve(root, 'fixtures/reference-calculations-real');
const holidaySchemaPath = resolve(root, 'schemas/fixtures/nrw-holidays.schema.json');
const holidayFixturePath = resolve(root, 'fixtures/calendars/nrw-holidays-2026.json');

async function readJson(filePath) {
  const content = await readFile(filePath, 'utf8');
  return JSON.parse(content);
}

async function main() {
  const schema = await readJson(fixtureSchemaPath);
  const holidaySchema = await readJson(holidaySchemaPath);
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const validateReference = ajv.compile(schema);
  const validateHoliday = ajv.compile(holidaySchema);

  const referenceFiles = (await readdir(fixturesDir))
    .filter((entry) => entry.endsWith('.json'))
    .sort();
  const realDerivedFiles = (await readdir(realDerivedFixturesDir))
    .filter((entry) => entry.endsWith('.json'))
    .sort();

  let failed = false;

  for (const file of referenceFiles) {
    const fixture = await readJson(resolve(fixturesDir, file));
    const valid = validateReference(fixture);

    if (!valid) {
      failed = true;
      console.error(`Invalid fixture: ${file}`);
      console.error(ajv.errorsText(validateReference.errors, { separator: '\n' }));
      continue;
    }

    console.log(`✓ Valid fixture: ${file}`);
  }

  for (const file of realDerivedFiles) {
    const fixture = await readJson(resolve(realDerivedFixturesDir, file));
    const valid = validateReference(fixture);

    if (!valid) {
      failed = true;
      console.error(`Invalid real-derived fixture: ${file}`);
      console.error(ajv.errorsText(validateReference.errors, { separator: '\n' }));
      continue;
    }

    console.log(`✓ Valid real-derived fixture: ${file}`);
  }

  const holidayFixture = await readJson(holidayFixturePath);
  const validHoliday = validateHoliday(holidayFixture);
  if (!validHoliday) {
    failed = true;
    console.error(`Invalid holiday fixture: ${holidayFixturePath}`);
    console.error(ajv.errorsText(validateHoliday.errors, { separator: '\n' }));
  } else {
    console.log('✓ Valid holiday fixture: fixtures/calendars/nrw-holidays-2026.json');
  }

  if (failed) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fixture validation failed:', error);
  process.exit(1);
});
