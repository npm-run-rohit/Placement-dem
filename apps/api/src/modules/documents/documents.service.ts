import type { DocumentView } from '@bimaplacement/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { DataSource, In, Repository } from 'typeorm';
import { DocumentKind, DocumentVisibility, RFQ_UPLOAD_ACCEPT_DEFAULT, Role } from '@bimaplacement/contracts';
import { DomainError } from '../../common/errors/domain-error';
import { STORAGE, type StoragePort } from '../../infrastructure/storage/storage.port';
import { MALWARE_SCANNER, type MalwareScanner } from '../../infrastructure/malware/malware.port';
import { AppSetting } from '../masters/entities/app-setting.entity';
import { User } from '../users/user.entity';
import { DocumentAccess } from './document-access.entity';
import type { AuthUser } from '../../common/auth/auth.types';
import { assertTicketVisible } from '../tickets/ticket-visibility';
import { Document } from './document.entity';

const EXTERNAL_KINDS = [DocumentKind.QUOTE, DocumentKind.QCR];

/** File name as a storage key segment: no path separators or dot segments, whatever the uploader sent. */
export const safeKeyPart = (name: string) =>
  name
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^\.+/, '_')
    .slice(0, 120) || 'file';

@Injectable()
export class DocumentsService {
  constructor(
    @InjectRepository(Document) private readonly docs: Repository<Document>,
    @Inject(STORAGE) private readonly storage: StoragePort,
    @Inject(MALWARE_SCANNER) private readonly scanner: MalwareScanner,
    private readonly ds: DataSource,
  ) {}

  /** FR-208 for routes keyed by a document or a body field rather than the ticket in the URL. */
  assertTicketVisible(user: AuthUser, ticketId: string | null | undefined) {
    return assertTicketVisible(this.ds, user, ticketId);
  }

  /**
   * Store bytes + index row. Every file is scanned first and stored only if clean (PLAN 4.5, PRD 10.1); a scanner
   * error fails the upload rather than storing an unscanned file. RFQ types follow the Upload Rule master
   * (FR-155); no size limit in V1.
   */
  async upload(input: {
    ticketId: string | null;
    kind: DocumentKind;
    fileName: string;
    contentType: string;
    buffer: Buffer;
    uploadedBy: string;
  }) {
    if (input.kind === DocumentKind.RFQ_EXCEL) {
      const accept = await this.rfqAccept();
      const ext = input.fileName.slice(input.fileName.lastIndexOf('.')).toLowerCase();
      if (!accept.includes(ext)) throw DomainError.guard(`Accepted RFQ types: ${accept.join(', ')}`);
    }
    const scan = await this.scanner.scan(input.buffer, input.fileName);
    if (!scan.clean)
      throw new DomainError(
        'MALWARE_DETECTED',
        `${input.fileName} was rejected: malware detected (${scan.signature})`,
      );
    const key = `${input.ticketId ? `tickets/${input.ticketId}` : 'unassigned'}/${input.kind}/${randomUUID()}-${safeKeyPart(input.fileName)}`;
    const put = await this.storage.put({ key, body: input.buffer, contentType: input.contentType });
    return this.docs.save(
      this.docs.create({
        ticketId: input.ticketId,
        kind: input.kind,
        visibility: EXTERNAL_KINDS.includes(input.kind)
          ? DocumentVisibility.EXTERNAL
          : DocumentVisibility.INTERNAL,
        fileName: input.fileName,
        contentType: input.contentType,
        sizeBytes: String(put.size),
        storageKey: put.key,
        sha256: put.sha256,
        scanStatus: 'clean',
        scanEngine: scan.engine,
        scannedAt: new Date(),
        uploadedBy: input.uploadedBy,
      }),
    );
  }

  private async rfqAccept(): Promise<string[]> {
    const row = await this.ds.getRepository(AppSetting).findOneBy({ key: 'upload_rules' });
    const accept = (row?.value as { rfqAccept?: string[] } | undefined)?.rfqAccept;
    return accept?.length ? accept : RFQ_UPLOAD_ACCEPT_DEFAULT;
  }

  async forTicket(ticketId: string): Promise<DocumentView[]> {
    const rows = await this.docs.find({ where: { ticketId }, order: { uploadedAt: 'DESC' } });
    return rows.map((d) => ({
      id: d.id,
      kind: d.kind,
      visibility: d.visibility,
      fileName: d.fileName,
      contentType: d.contentType,
      sizeBytes: d.sizeBytes,
      uploadedBy: d.uploadedBy,
      uploadedAt: d.uploadedAt.toISOString(),
    }));
  }

  /** Signed link to a document; every request is written to the access log (PLAN 4.5). */
  async downloadUrl(user: AuthUser, id: string, inline = false, ip: string | null = null) {
    const d = await this.readable(user, id);
    await this.logAccess(user, d, inline ? 'view' : 'download', ip);
    return {
      url: await this.storage.signedDownloadUrl(d.storageKey, d.fileName, undefined, inline),
      fileName: d.fileName,
    };
  }

  /**
   * Dev storage only: the file behind a local download link. Looked up by its stored key (never a raw path), with
   * the same visibility rule and the stored file name.
   */
  async localFile(user: AuthUser, key: string) {
    const d = await this.docs.findOneBy({ storageKey: key });
    if (!d) throw DomainError.notFound('Document', key);
    await this.readable(user, d.id);
    return { fileName: d.fileName, stream: await this.storage.get(d.storageKey) };
  }

  /** Who opened a document (Placement Head / Admin). */
  async accessLog(user: AuthUser, id: string): Promise<Array<{ at: string; by: string; action: string }>> {
    if (!user.roles.includes(Role.PLACEMENT_HEAD) && !user.roles.includes(Role.ADMIN))
      throw new DomainError('FORBIDDEN', 'Only the Placement Head or Admin can see document access');
    await this.readable(user, id);
    const rows = await this.ds
      .getRepository(DocumentAccess)
      .find({ where: { documentId: id }, order: { at: 'DESC' }, take: 200 });
    const users = rows.length
      ? await this.ds.getRepository(User).findBy({ id: In([...new Set(rows.map((r) => r.userId))]) })
      : [];
    return rows.map((r) => ({
      at: r.at.toISOString(),
      by: users.find((u) => u.id === r.userId)?.name ?? 'Unknown',
      action: r.action,
    }));
  }

  private async readable(user: AuthUser, id: string) {
    const d = await this.docs.findOneBy({ id });
    if (!d) throw DomainError.notFound('Document', id);
    await this.assertTicketVisible(user, d.ticketId);
    if (d.scanStatus !== 'clean' && d.scanStatus !== 'skipped')
      throw DomainError.guard(`${d.fileName} is not available until it scans clean`);
    return d;
  }

  private logAccess(user: AuthUser, d: Document, action: 'view' | 'download', ip: string | null) {
    return this.ds
      .getRepository(DocumentAccess)
      .insert({ documentId: d.id, ticketId: d.ticketId, userId: user.id, action, ip });
  }

  /** Whole file in memory (Copycat payloads: quote PDFs are small). */
  async readBuffer(id: string): Promise<{ fileName: string; contentType: string; bytes: Buffer }> {
    const d = await this.docs.findOneByOrFail({ id });
    const chunks: Buffer[] = [];
    for await (const chunk of await this.storage.get(d.storageKey)) chunks.push(Buffer.from(chunk));
    return { fileName: d.fileName, contentType: d.contentType, bytes: Buffer.concat(chunks) };
  }
}
