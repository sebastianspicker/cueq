/** Private authenticated-encryption object adapter shared by the API and backup verifier. */
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import { mkdir, open, realpath, unlink, type FileHandle } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';

const MAX_BYTES = 10 * 1024 * 1024;
const MAGIC = 'CUEQDOC1\n';
export type DocumentMimeType = 'application/pdf' | 'image/png' | 'image/jpeg';
export interface DocumentObjectManifest {
  objectKey: string;
  keyId: string;
  checksum: string;
  encryptedChecksum: string;
  sizeBytes: number;
  mimeType: DocumentMimeType;
}

export function validateDocumentContent(content: Buffer, declaredType: string): DocumentMimeType {
  if (content.length === 0 || content.length > MAX_BYTES) throw new Error('DOCUMENT_SIZE_INVALID');
  const valid =
    declaredType === 'application/pdf'
      ? content.subarray(0, 5).toString('ascii') === '%PDF-'
      : declaredType === 'image/png'
        ? content.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : declaredType === 'image/jpeg'
          ? content[0] === 0xff && content[1] === 0xd8 && content[2] === 0xff
          : false;
  if (!valid) throw new Error('DOCUMENT_TYPE_INVALID');
  return declaredType as DocumentMimeType;
}

function digest(bytes: Buffer) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function readBoundedObject(handle: FileHandle): Promise<Buffer> {
  const buffer = Buffer.alloc(MAX_BYTES + 1025);
  let offset = 0;
  while (offset < buffer.length) {
    const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, offset);
    if (!bytesRead) return buffer.subarray(0, offset);
    offset += bytesRead;
  }
  throw new Error('DOCUMENT_OBJECT_INVALID');
}

export class DocumentObjectStorage {
  private readonly root: string;
  private readonly keys: Map<string, Buffer>;
  private readonly activeKeyId: string;

  constructor(config: { root: string; keys: Record<string, string>; activeKeyId: string }) {
    if (
      !isAbsolute(config.root) ||
      /(?:^|[/\\])(?:public|static|\.next)(?:[/\\]|$)/u.test(config.root)
    )
      throw new Error('DOCUMENT_STORAGE_MUST_BE_PRIVATE');
    this.root = resolve(config.root);
    this.keys = new Map(
      Object.entries(config.keys).map(([id, value]) => {
        const key = Buffer.from(value, 'base64');
        if (
          !/^[A-Za-z0-9_-]{1,50}$/.test(id) ||
          key.length !== 32 ||
          key.toString('base64') !== value
        )
          throw new Error('DOCUMENT_KEY_INVALID');
        return [id, key];
      }),
    );
    if (!this.keys.has(config.activeKeyId)) throw new Error('DOCUMENT_ACTIVE_KEY_MISSING');
    this.activeKeyId = config.activeKeyId;
  }

  static fromEnvironment(env: NodeJS.ProcessEnv = process.env) {
    const root = env.DOCUMENT_STORAGE_ROOT;
    const activeKeyId = env.DOCUMENT_ACTIVE_KEY_ID;
    if (!root || !activeKeyId || !env.DOCUMENT_ENCRYPTION_KEYS)
      throw new Error('DOCUMENT_STORAGE_NOT_CONFIGURED');
    let keys: unknown;
    try {
      keys = JSON.parse(env.DOCUMENT_ENCRYPTION_KEYS);
    } catch {
      throw new Error('DOCUMENT_KEY_INVALID');
    }
    if (
      !keys ||
      typeof keys !== 'object' ||
      Array.isArray(keys) ||
      Object.values(keys).some((v) => typeof v !== 'string')
    )
      throw new Error('DOCUMENT_KEY_INVALID');
    return new DocumentObjectStorage({ root, activeKeyId, keys: keys as Record<string, string> });
  }

  private objectPath(objectKey: string) {
    if (!/^[0-9a-f-]{36}\.enc$/.test(objectKey)) throw new Error('DOCUMENT_OBJECT_KEY_INVALID');
    return join(this.root, objectKey);
  }

  private async prepareRoot() {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    if ((await realpath(this.root)) !== this.root) throw new Error('DOCUMENT_STORAGE_SYMLINK');
  }

  async write(
    content: Buffer,
    declaredType: string,
    objectKey = randomUUID() + '.enc',
  ): Promise<DocumentObjectManifest> {
    const mimeType = validateDocumentContent(content, declaredType);
    const key = this.keys.get(this.activeKeyId);
    if (!key) throw new Error('DOCUMENT_ACTIVE_KEY_MISSING');
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, nonce);
    cipher.setAAD(Buffer.from(MAGIC + this.activeKeyId));
    const ciphertext = Buffer.concat([cipher.update(content), cipher.final()]);
    const header = JSON.stringify({
      keyId: this.activeKeyId,
      nonce: nonce.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
    });
    const envelope = Buffer.concat([Buffer.from(MAGIC + header + '\n'), ciphertext]);
    await this.prepareRoot();
    const handle = await open(this.objectPath(objectKey), 'wx', 0o600);
    try {
      await handle.writeFile(envelope);
      await handle.sync();
    } finally {
      await handle.close();
    }
    return {
      objectKey,
      keyId: this.activeKeyId,
      checksum: digest(content),
      encryptedChecksum: digest(envelope),
      sizeBytes: content.length,
      mimeType,
    };
  }

  async read(manifest: DocumentObjectManifest): Promise<Buffer> {
    await this.prepareRoot();
    const handle = await open(
      this.objectPath(manifest.objectKey),
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    let envelope: Buffer;
    try {
      const metadata = await handle.stat();
      if (!metadata.isFile() || metadata.size > MAX_BYTES + 1024)
        throw new Error('DOCUMENT_OBJECT_INVALID');
      envelope = await readBoundedObject(handle);
    } finally {
      await handle.close();
    }
    if (
      digest(envelope) !== manifest.encryptedChecksum ||
      !envelope.subarray(0, MAGIC.length).equals(Buffer.from(MAGIC))
    )
      throw new Error('DOCUMENT_CHECKSUM_MISMATCH');
    const end = envelope.indexOf(10, MAGIC.length);
    if (end < MAGIC.length || end > 1024) throw new Error('DOCUMENT_OBJECT_INVALID');
    const header = JSON.parse(envelope.subarray(MAGIC.length, end).toString('utf8')) as {
      keyId: string;
      nonce: string;
      tag: string;
    };
    const key = this.keys.get(header.keyId);
    if (!key || header.keyId !== manifest.keyId) throw new Error('DOCUMENT_DECRYPTION_KEY_MISSING');
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(header.nonce, 'base64'));
    decipher.setAAD(Buffer.from(MAGIC + header.keyId));
    decipher.setAuthTag(Buffer.from(header.tag, 'base64'));
    const content = Buffer.concat([decipher.update(envelope.subarray(end + 1)), decipher.final()]);
    if (content.length !== manifest.sizeBytes || digest(content) !== manifest.checksum)
      throw new Error('DOCUMENT_CHECKSUM_MISMATCH');
    validateDocumentContent(content, manifest.mimeType);
    return content;
  }

  /** Backup copies preserve encrypted bytes and verify them using the same keys. */
  async copyVerifiedTo(manifest: DocumentObjectManifest, destinationRoot: string) {
    await this.read(manifest);
    const destination = new DocumentObjectStorage({
      root: destinationRoot,
      activeKeyId: this.activeKeyId,
      keys: Object.fromEntries([...this.keys].map(([id, key]) => [id, key.toString('base64')])),
    });
    await destination.prepareRoot();
    const source = await open(
      this.objectPath(manifest.objectKey),
      constants.O_RDONLY | constants.O_NOFOLLOW,
    );
    let envelope: Buffer;
    try {
      envelope = await readBoundedObject(source);
    } finally {
      await source.close();
    }
    if (envelope.length > MAX_BYTES + 1024 || digest(envelope) !== manifest.encryptedChecksum)
      throw new Error('DOCUMENT_CHECKSUM_MISMATCH');
    let target;
    try {
      target = await open(destination.objectPath(manifest.objectKey), 'wx', 0o600);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
    }
    if (target) {
      try {
        await target.writeFile(envelope);
        await target.sync();
      } finally {
        await target.close();
      }
    }
    await destination.read(manifest);
  }

  /** Compensates only an object whose metadata transaction failed; retention has no delete scheduler. */
  async discardUnreferenced(objectKey: string) {
    await unlink(this.objectPath(objectKey));
  }
}
