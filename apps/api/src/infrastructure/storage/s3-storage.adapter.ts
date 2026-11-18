import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createHash } from 'node:crypto';
import type { Readable } from 'node:stream';
import type { PutObjectInput, StoragePort } from './storage.port';

/** S3 + SSE-KMS (ap-south-1 for data residency, W13). Bucket has versioning + object lock for IRDAI retention. */
export class S3StorageAdapter implements StoragePort {
  private readonly s3: S3Client;

  constructor(
    private readonly bucket: string,
    region: string,
    private readonly kmsKeyId?: string,
  ) {
    this.s3 = new S3Client({ region });
  }

  async put(input: PutObjectInput) {
    const buf = Buffer.isBuffer(input.body) ? input.body : await streamToBuffer(input.body);
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        Body: buf,
        ContentType: input.contentType,
        Metadata: input.metadata,
        ServerSideEncryption: this.kmsKeyId ? 'aws:kms' : 'AES256',
        SSEKMSKeyId: this.kmsKeyId,
      }),
    );
    return { key: input.key, size: buf.length, sha256: createHash('sha256').update(buf).digest('hex') };
  }

  async get(key: string) {
    const out = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    return out.Body as Readable;
  }

  async signedDownloadUrl(key: string, fileName: string, ttlSeconds = 300, inline = false) {
    return getSignedUrl(
      this.s3,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentDisposition: `${inline ? 'inline' : 'attachment'}; filename="${fileName}"`,
      }),
      { expiresIn: ttlSeconds },
    );
  }

  async signedUploadUrl(key: string, contentType: string, ttlSeconds = 300) {
    return getSignedUrl(
      this.s3,
      new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }),
      {
        expiresIn: ttlSeconds,
      },
    );
  }
}

async function streamToBuffer(s: Readable) {
  const chunks: Buffer[] = [];
  for await (const c of s) chunks.push(Buffer.from(c));
  return Buffer.concat(chunks);
}
