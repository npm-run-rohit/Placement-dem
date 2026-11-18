import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../../common/persistence/base.entity';

/**
 * Query to the RM on an RFQ version (M2). Open until the PM resolves it - an RM answer never
 * resolves it (BR-111). Re-sending includes still-open queries without duplicating (BR-112).
 */
@Entity('rfq_queries')
@Index('ix_query_ticket_rfq', ['ticketId', 'rfqVersionId'])
export class RfqQuery extends BaseEntity {
  @Column({ name: 'ticket_id', type: 'uuid' })
  ticketId: string;

  @Column({ name: 'rfq_version_id', type: 'uuid' })
  rfqVersionId: string;

  /** Q-nn, unique per ticket; used as BimaSetu queryRef. */
  @Column({ type: 'text' })
  ref: string;

  @Column({ type: 'text' })
  label: string;

  @Column({ name: 'raised_by_id', type: 'uuid' })
  raisedById: string;

  @Column({ name: 'raised_at', type: 'timestamptz' })
  raisedAt: Date;

  /** How many times this query was (re)sent to the RM. */
  @Column({ name: 'send_count', type: 'int', default: 1 })
  sendCount: number;

  @Column({ type: 'text', nullable: true })
  answer: string | null;

  @Column({ name: 'answered_at', type: 'timestamptz', nullable: true })
  answeredAt: Date | null;

  @Column({ name: 'answered_by', type: 'text', nullable: true })
  answeredBy: string | null;

  @Column({ type: 'boolean', default: false })
  resolved: boolean;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @Column({ name: 'resolved_by_id', type: 'uuid', nullable: true })
  resolvedById: string | null;
}
