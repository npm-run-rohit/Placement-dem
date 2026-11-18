import { Column, Entity, Index } from 'typeorm';
import { InboundClass, ReviewQueue, ReviewStatus } from '@bimaplacement/contracts';
import { BaseEntity } from '../../../common/persistence/base.entity';

/**
 * Every inbound mail read from a PM mailbox (M7). Mapping + classification results are stored;
 * ambiguous/low-confidence mail is routed to Manual Review and never auto-applied (BR-046).
 */
@Entity('inbound_mails')
@Index('ix_inbound_review', ['reviewQueue', 'reviewStatus'])
export class InboundMail extends BaseEntity {
  @Index({ unique: true })
  @Column({ name: 'provider_message_id', type: 'text' })
  providerMessageId: string; // dedupe (10.2)

  @Column({ type: 'text' })
  mailbox: string;

  @Column({ name: 'from_address', type: 'text' })
  fromAddress: string;

  @Column({ name: 'to_addresses', type: 'text', array: true, default: '{}' })
  toAddresses: string[];

  @Column({ type: 'text' })
  subject: string;

  @Column({ name: 'body_text', type: 'text' })
  bodyText: string;

  @Column({ name: 'received_at', type: 'timestamptz' })
  receivedAt: Date;

  @Column({ name: 'attachment_document_ids', type: 'uuid', array: true, default: '{}' })
  attachmentDocumentIds: string[];

  // ---- mapping ----
  @Column({ name: 'ticket_id', type: 'uuid', nullable: true })
  ticketId: string | null;

  @Column({ name: 'thread_id', type: 'uuid', nullable: true })
  threadId: string | null;

  @Column({ name: 'mapping_confidence', type: 'real', nullable: true })
  mappingConfidence: number | null;

  @Column({ name: 'mapping_basis', type: 'text', nullable: true })
  mappingBasis: string | null; // subject-ref | reply-chain | sender | product-alias

  @Column({ name: 'unknown_sender', type: 'boolean', default: false })
  unknownSender: boolean; // FR-071

  @Column({ name: 'suggested_ticket_ids', type: 'uuid', array: true, default: '{}' })
  suggestedTicketIds: string[]; // product-type alias matches (FR-231)

  // ---- classification ----
  @Column({ type: 'text', nullable: true })
  classification: InboundClass | null;

  @Column({ name: 'classification_confidence', type: 'real', nullable: true })
  classificationConfidence: number | null;

  // ---- manual review (FR-227..229) ----
  @Column({ name: 'review_queue', type: 'text', default: ReviewQueue.NONE })
  reviewQueue: ReviewQueue;

  @Column({ name: 'review_reason', type: 'text', nullable: true })
  reviewReason: string | null;

  @Column({ name: 'review_status', type: 'text', default: ReviewStatus.PENDING })
  reviewStatus: ReviewStatus;

  @Column({ name: 'reviewed_by_id', type: 'uuid', nullable: true })
  reviewedById: string | null;

  @Column({ name: 'reviewed_at', type: 'timestamptz', nullable: true })
  reviewedAt: Date | null;

  /** What was finally applied (also stored as classifier feedback, FR-078). */
  @Column({ name: 'applied_class', type: 'text', nullable: true })
  appliedClass: InboundClass | null;

  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt: Date | null;
}
