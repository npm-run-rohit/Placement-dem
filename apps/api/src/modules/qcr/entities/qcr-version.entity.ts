import { Column, Entity, Index } from 'typeorm';
import { QcrSource, QcrStatus, RevisionAsk } from '@bimaplacement/contracts';
import { BaseEntity } from '../../../common/persistence/base.entity';

/**
 * QCR Version (Appendix E.5). Built by Copycat, uploaded manually, or a single quote PDF.
 * Immutable once released (FR-103, BR-121): released rows/result/quote ids are never recomputed.
 * Numbering continues across RFQ versions (FR-244).
 */
@Entity('qcr_versions')
@Index('ux_qcr_ticket_version', ['ticketId', 'version'], { unique: true })
export class QcrVersion extends BaseEntity {
  @Column({ name: 'ticket_id', type: 'uuid' })
  ticketId: string;

  @Column({ type: 'int' })
  version: number;

  @Column({ name: 'rfq_version', type: 'int' })
  rfqVersion: number;

  /** BimaSetu round this QCR is delivered as (FR-285, FR-287). */
  @Column({ type: 'int' })
  round: number;

  @Column({ type: 'text', default: QcrStatus.DRAFT })
  status: QcrStatus;

  @Column({ type: 'text' })
  source: QcrSource;

  @Column({ name: 'quote_ids', type: 'uuid', array: true, default: '{}' })
  quoteIds: string[];

  @Column({ name: 'early_release_reason', type: 'text', nullable: true })
  earlyReleaseReason: string | null;

  @Column({ name: 'early_release_count', type: 'int', nullable: true })
  earlyReleaseCount: number | null;

  /** QCR file: Copycat result file, manual upload, or the single quote's PDF. */
  @Column({ name: 'document_id', type: 'uuid', nullable: true })
  documentId: string | null;

  /** Copycat structured comparison (FR-247) - frozen on release. */
  @Column({ name: 'copycat_result', type: 'jsonb', nullable: true })
  copycatResult: Record<string, unknown> | null;

  @Column({ name: 'current_copycat_request_id', type: 'text', nullable: true })
  currentCopycatRequestId: string | null;

  @Column({ name: 'rows_checked', type: 'boolean', default: false })
  rowsChecked: boolean;

  @Column({ name: 'released_at', type: 'timestamptz', nullable: true })
  releasedAt: Date | null;

  @Column({ name: 'released_by_id', type: 'uuid', nullable: true })
  releasedById: string | null;

  @Column({ name: 'sent_to', type: 'text', nullable: true })
  sentTo: string | null; // 'BimaSetu' | 'RM <email>'

  @Column({ name: 'cover_note', type: 'text', nullable: true })
  coverNote: string | null;

  /** Revision request received against this released QCR. */
  @Column({ type: 'jsonb', nullable: true })
  objection: { by: 'client' | 'us'; reason: string; asks: RevisionAsk[]; at: string } | null;
}
