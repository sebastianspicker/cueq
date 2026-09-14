import { randomBytes } from 'node:crypto';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DocumentObjectStorage, validateDocumentContent } from '../src/document-storage.js';

const roots: string[] = [];
async function fixture() {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'cueq-document-test-')));
  roots.push(root);
  const config = {
    root,
    keys: { initial: randomBytes(32).toString('base64') },
    activeKeyId: 'initial',
  };
  return { root, config, storage: new DocumentObjectStorage(config) };
}
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe('private encrypted document objects', () => {
  it('encrypts content, verifies round trips and preserves bytes in a separate backup object root', async () => {
    const { root, config, storage } = await fixture();
    const content = Buffer.from('%PDF-1.7\nSynthetic personnel test only');
    const manifest = await storage.write(content, 'application/pdf');
    const encrypted = await readFile(join(root, manifest.objectKey));
    expect(encrypted.includes(content)).toBe(false);
    expect(await storage.read(manifest)).toEqual(content);
    const backupRoot = join(root, 'backup');
    await storage.copyVerifiedTo(manifest, backupRoot);
    expect(await readFile(join(backupRoot, manifest.objectKey))).toEqual(encrypted);
    expect(await new DocumentObjectStorage({ ...config, root: backupRoot }).read(manifest)).toEqual(
      content,
    );
  });
  it('rejects corruption, wrong keys and checksum substitution', async () => {
    const { root, config, storage } = await fixture();
    const manifest = await storage.write(Buffer.from('%PDF-1.7\nSynthetic'), 'application/pdf');
    await expect(
      new DocumentObjectStorage({
        ...config,
        keys: { initial: randomBytes(32).toString('base64') },
      }).read(manifest),
    ).rejects.toThrow();
    await expect(storage.read({ ...manifest, checksum: '0'.repeat(64) })).rejects.toThrow(
      'DOCUMENT_CHECKSUM_MISMATCH',
    );
    const path = join(root, manifest.objectKey);
    const bytes = await readFile(path);
    bytes[bytes.length - 1] = (bytes.at(-1) ?? 0) ^ 1;
    await writeFile(path, bytes);
    await expect(storage.read(manifest)).rejects.toThrow('DOCUMENT_CHECKSUM_MISMATCH');
  });
  it('checks MIME signatures, size limits, private paths and object keys', async () => {
    expect(() => validateDocumentContent(Buffer.from('not a PDF'), 'application/pdf')).toThrow(
      'DOCUMENT_TYPE_INVALID',
    );
    expect(() => validateDocumentContent(Buffer.alloc(10 * 1024 * 1024 + 1), 'image/png')).toThrow(
      'DOCUMENT_SIZE_INVALID',
    );
    expect(
      validateDocumentContent(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), 'image/png'),
    ).toBe('image/png');
    expect(validateDocumentContent(Buffer.from([255, 216, 255]), 'image/jpeg')).toBe('image/jpeg');
    const { config, storage } = await fixture();
    expect(() => new DocumentObjectStorage({ ...config, root: '/tmp/public/documents' })).toThrow(
      'DOCUMENT_STORAGE_MUST_BE_PRIVATE',
    );
    await expect(storage.discardUnreferenced('../outside.enc')).rejects.toThrow(
      'DOCUMENT_OBJECT_KEY_INVALID',
    );
  });
});
