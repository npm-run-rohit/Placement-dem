import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { DocumentKind, DocumentVisibility } from '@bimaplacement/contracts';

/** Document index (W4). Bytes live in S3 (KMS) under tickets/<ticketId>/...; never overwritten. */
@Entity('documents')
@Index('ix_document_ticket_kind', ['ticketId', 'kind'])
export class Document {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'ticket_id', type: 'uuid', nullable: true })
  ticketId: string | null;

  @Column({ type: 'text' })
  kind: DocumentKind;

  @Column({ type: 'text', default: DocumentVisibility.INTERNAL })
  visibility: DocumentVisibility; // Documents tab Internal / External

  @Column({ name: 'file_name', type: 'text' })
  fileName: string;

  @Column({ name: 'content_type', type: 'text' })
  contentType: string;

  @Column({ name: 'size_bytes', type: 'bigint' })
  sizeBytes: string;

  @Column({ name: 'storage_key', type: 'text' })
  storageKey: string;

  @Column({ type: 'text' })
  sha256: string;

  /** File scanning before processing (10.1). */
  @Column({ name: 'scan_status', type: 'text', default: 'pending' })
  scanStatus: 'pending' | 'clean' | 'infected' | 'skipped';

  @Column({ name: 'scan_engine', type: 'text', nullable: true })
  scanEngine: string | null;

  @Column({ name: 'scanned_at', type: 'timestamptz', nullable: true })
  scannedAt: Date | null;

  @Column({ name: 'uploaded_by', type: 'text' })
  uploadedBy: string; // user id or 'system' / 'insurer:<email>' / 'bimasetu'

  @CreateDateColumn({ name: 'uploaded_at', type: 'timestamptz' })
  uploadedAt: Date;
}
