import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const root = resolve(import.meta.dirname, '..');
const domainRoot = resolve(root, 'schemas/domain');
const fixtureRoot = resolve(root, 'schemas/fixtures');

async function readJson(filePath) {
  const content = await readFile(filePath, 'utf8');
  return JSON.parse(content);
}

async function listJsonFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const nested = await listJsonFiles(resolve(dir, entry.name));
      files.push(...nested);
      continue;
    }

    if (entry.isFile() && entry.name.endsWith('.json')) {
      files.push(resolve(dir, entry.name));
    }
  }

  return files;
}

async function main() {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);

  const domainFiles = await listJsonFiles(domainRoot);
  const fixtureFiles = await listJsonFiles(fixtureRoot);
  const schemaFiles = [...domainFiles, ...fixtureFiles];

  for (const file of schemaFiles) {
    const schema = await readJson(file);
    ajv.addSchema(schema);
  }

  let failed = false;

  for (const file of schemaFiles) {
    const schema = await readJson(file);
    const validSchema = ajv.validateSchema(schema);
    if (!validSchema) {
      failed = true;
      console.error(`Invalid schema: ${file}`);
      console.error(ajv.errorsText(ajv.errors, { separator: '\n' }));
      continue;
    }

    try {
      ajv.getSchema(schema.$id) ?? ajv.compile(schema);
      console.log(`✓ Compiled schema: ${file}`);
    } catch (error) {
      failed = true;
      console.error(`Failed to compile schema: ${file}`);
      console.error(error);
    }
  }

  if (failed) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Schema validation failed:', error);
  process.exit(1);
});
