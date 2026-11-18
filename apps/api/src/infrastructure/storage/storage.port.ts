import type { Readable } from 'node:stream';

export interface PutObjectInput {
  key: string; // e.g. tickets/<ticketId>/rfq/v1/<uuid>-<fileName>
  body: Buffer | Readable;
  contentType: string;
  metadata?: Record<string, string>;
}

/**
 * Document storage (S3 + KMS in AWS, local disk in dev). Per-ticket prefixes;
 * the DB `documents` table is the index; objects are never overwritten (versioned keys).
 */
export interface StoragePort {
  put(input: PutObjectInput): Promise<{ key: string; size: number; sha256: string }>;
  get(key: string): Promise<Readable>;
  /** inline = open in the browser (View) instead of saving (Download). */
  signedDownloadUrl(key: string, fileName: string, ttlSeconds?: number, inline?: boolean): Promise<string>;
  signedUploadUrl(key: string, contentType: string, ttlSeconds?: number): Promise<string>;
}

export const STORAGE = Symbol('STORAGE');
