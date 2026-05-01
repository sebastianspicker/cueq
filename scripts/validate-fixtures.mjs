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
const integrationFixturesDir = resolve(root, 'fixtures', 'integrations');

const csvExpectations = {
  'hr-master-phase3.csv': [
    'externalId',
    'firstName',
    'lastName',
    'email',
    'role',
    'organizationUnit',
    'workTimeModel',
    'weeklyHours',
    'dailyTargetHours',
    'supervisorExternalId',
  ],
  'terminal-sync-batch-phase3.csv': ['personId', 'timeTypeCode', 'startTime', 'endTime', 'note'],
};

async function readJson(filePath) {
  const content = await readFile(filePath, 'utf8');
  return JSON.parse(content);
}

async function validateCsvFixture(fileName) {
  const filePath = resolve(integrationFixturesDir, fileName);
  const content = await readFile(filePath, 'utf8');
  const lines = content
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    throw new Error('CSV fixture must contain a header row and at least one data row.');
  }

  const headers = lines[0]?.split(',').map((value) => value.trim()) ?? [];
  const expectedHeaders = csvExpectations[fileName];
  if (!expectedHeaders) {
    throw new Error(`No CSV fixture validation rule defined for ${fileName}.`);
  }

  for (const header of expectedHeaders) {
    if (!headers.includes(header)) {
      throw new Error(`Missing required CSV header: ${header}`);
    }
  }
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

  for (const file of Object.keys(csvExpectations).sort()) {
    try {
      await validateCsvFixture(file);
      console.log(`✓ Valid CSV fixture: fixtures/integrations/${file}`);
    } catch (error) {
      failed = true;
      console.error(`Invalid CSV fixture: fixtures/integrations/${file}`);
      console.error(error instanceof Error ? error.message : 'Unknown CSV validation error');
    }
  }

  if (failed) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fixture validation failed:', error);
  process.exit(1);
});
