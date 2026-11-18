import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import type { Readable } from 'node:stream';
import type { PutObjectInput, StoragePort } from './storage.port';

const toBuffer = async (body: Buffer | Readable) => {
  if (Buffer.isBuffer(body)) return body;
  const chunks: Buffer[] = [];
  for await (const c of body) chunks.push(Buffer.from(c));
  return Buffer.concat(chunks);
};

/** Dev-only storage on local disk. Download URLs point at DocumentsController's dev route. */
export class LocalStorageAdapter implements StoragePort {
  constructor(
    private readonly root: string,
    private readonly apiBase: string,
  ) {}

  /** Keys never leave the storage folder (no `..` or absolute keys). */
  private pathOf(key: string) {
    const root = resolve(this.root);
    const path = resolve(join(root, key));
    if (!path.startsWith(root + sep)) throw new Error(`Storage key escapes the storage folder: ${key}`);
    return path;
  }

  async put(input: PutObjectInput) {
    const buf = await toBuffer(input.body);
    const path = this.pathOf(input.key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, buf);
    return { key: input.key, size: buf.length, sha256: createHash('sha256').update(buf).digest('hex') };
  }

  async get(key: string) {
    return createReadStream(this.pathOf(key));
  }

  async signedDownloadUrl(key: string, fileName: string, _ttlSeconds?: number, inline = false) {
    return `${this.apiBase}/documents/_local?key=${encodeURIComponent(key)}&name=${encodeURIComponent(fileName)}${inline ? '&inline=1' : ''}`;
  }

  async signedUploadUrl(): Promise<string> {
    throw new Error('Local storage does not support presigned uploads - use multipart POST /documents');
  }
}
