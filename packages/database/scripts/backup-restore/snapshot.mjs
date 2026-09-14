import { createHash } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { DocumentObjectStorage } from '../../dist/document-storage.js';

const SNAPSHOT_FORMAT_VERSION = 3;
const PAGE_SIZE = 500;

// Discover every persisted model from the generated client rather than a list
// which silently omits newly introduced tables.
const MODELS = Prisma.dmmf.datamodel.models
  .map((model) => ({
    name: model.name,
    client: model.name[0].toLowerCase() + model.name.slice(1),
  }))
  .sort((a, b) => (a.name < b.name ? -1 : 1));

function canonical(value) {
  if (value === null || value === undefined) return value;
  if (typeof value === 'bigint') return { $bigint: String(value) };
  if (typeof value !== 'object') return value;
  if (typeof value.toJSON === 'function') return canonical(value.toJSON());
  if (Array.isArray(value)) return value.map(canonical);
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonical(value[key])]),
  );
}

async function hashTable(db, model, documents) {
  const hash = createHash('sha256');
  hash.update('[');
  let count = 0;
  let cursor;
  for (;;) {
    const rows = await db[model.client].findMany({
      orderBy: { id: 'asc' },
      take: PAGE_SIZE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    for (const row of rows) {
      if (model.name === 'PersonnelDocumentVersion') {
        documents.storage ??= DocumentObjectStorage.fromEnvironment(documents.environment);
        await documents.storage.read(row);
        if (documents.copyRoot) await documents.storage.copyVerifiedTo(row, documents.copyRoot);
        documents.hash.update(
          JSON.stringify({
            id: row.id,
            objectKey: row.objectKey,
            checksum: row.checksum,
            encryptedChecksum: row.encryptedChecksum,
            sizeBytes: row.sizeBytes,
          }) + '\n',
        );
        documents.count += 1;
      }
      if (count > 0) hash.update(',');
      hash.update(JSON.stringify(canonical(row)));
      count++;
    }
    if (rows.length < PAGE_SIZE) break;
    cursor = rows.at(-1).id;
  }
  hash.update(']');
  return { count, checksum: hash.digest('hex') };
}

/** Memory is bounded by one page; the snapshot contains hashes, never record payloads. */
export async function snapshot(
  prisma,
  models = MODELS,
  { documentStorage, documentCopyRoot, environment = process.env } = {},
) {
  return prisma.$transaction(
    async (tx) => {
      const documents = {
        storage: documentStorage,
        copyRoot: documentCopyRoot,
        environment,
        hash: createHash('sha256'),
        count: 0,
      };
      const tables = {};
      const tableChecksums = {};
      for (const model of models) {
        const result = await hashTable(tx, model, documents);
        tables[model.name] = result.count;
        tableChecksums[model.name] = result.checksum;
      }
      const documentObjects = { count: documents.count, checksum: documents.hash.digest('hex') };
      const checksum = createHash('sha256')
        .update(
          JSON.stringify({
            formatVersion: SNAPSHOT_FORMAT_VERSION,
            tables,
            tableChecksums,
            documentObjects,
          }),
        )
        .digest('hex');
      return {
        formatVersion: SNAPSHOT_FORMAT_VERSION,
        tables,
        tableChecksums,
        documentObjects,
        checksum,
      };
    },
    { isolationLevel: 'RepeatableRead', timeout: 300_000 },
  );
}

export async function captureStableDump({
  source,
  snapshotSource = snapshot,
  dumpSource,
  connection,
  tempDir,
  dumpPath,
  documentCopyRoot,
}) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const before = await snapshotSource(source);
    dumpSource(connection, tempDir, dumpPath);
    const after = await snapshotSource(source, undefined, { documentCopyRoot });
    if (before.checksum === after.checksum) return after;
  }
  throw new Error('SOURCE_CHANGED_DURING_BACKUP');
}
