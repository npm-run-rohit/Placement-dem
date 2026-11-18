import { Column, Entity, Index } from 'typeorm';
import { QuoteDecision } from '@bimaplacement/contracts';
import { BaseEntity, numericTransformer } from '../../../common/persistence/base.entity';

/**
 * Quote Version (Appendix E.4). Stored AS RECEIVED - no BimaKavach extraction (FR-263).
 * Only the PM-recorded premium is captured (FR-265). Version counts per thread.
 */
@Entity('quotes')
@Index('ux_quote_thread_version', ['threadId', 'version'], { unique: true })
@Index('ix_quote_ticket_rfq', ['ticketId', 'rfqVersion'])
export class Quote extends BaseEntity {
  @Column({ name: 'ticket_id', type: 'uuid' })
  ticketId: string;

  @Column({ name: 'thread_id', type: 'uuid' })
  threadId: string;

  @Column({ name: 'insurer_id', type: 'uuid' })
  insurerId: string;

  @Column({ name: 'rfq_version', type: 'int' })
  rfqVersion: number;

  @Column({ type: 'int' })
  version: number;

  @Column({ name: 'received_at', type: 'timestamptz' })
  receivedAt: Date;

  /** PDF / scanned PDF / email-body / Excel as received (FR-082). */
  @Column({ name: 'document_id', type: 'uuid' })
  documentId: string;

  @Column({ name: 'source_mail_id', type: 'uuid', nullable: true })
  sourceMailId: string | null;

  /** Dedupe hash of the document (+ thread) to avoid duplicate quote versions (10.2). */
  @Column({ name: 'content_hash', type: 'text', nullable: true })
  contentHash: string | null;

  @Column({ type: 'text', nullable: true })
  decision: QuoteDecision | null;

  @Column({ name: 'decision_note', type: 'text', nullable: true })
  decisionNote: string | null;

  @Column({ name: 'decided_at', type: 'timestamptz', nullable: true })
  decidedAt: Date | null;

  @Column({ name: 'decided_by_id', type: 'uuid', nullable: true })
  decidedById: string | null;

  @Column({ type: 'numeric', precision: 14, scale: 2, nullable: true, transformer: numericTransformer })
  premium: number | null;

  @Column({ name: 'superseded_by_quote_id', type: 'uuid', nullable: true })
  supersededByQuoteId: string | null;

  /** Clarification text sent to the insurer for this quote (prototype dropped it - we keep it). */
  @Column({ name: 'clarification_text', type: 'text', nullable: true })
  clarificationText: string | null;
}
