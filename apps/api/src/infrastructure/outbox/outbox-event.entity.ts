import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type OutboxDestination = 'bimasetu' | 'bus' | 'mail' | 'notification' | 'copycat';

/**
 * Transactional outbox (Architecture plan W1). Written in the SAME transaction as the
 * state change; the relay publishes it afterwards, so nothing is lost on failure and
 * nothing is sent for a rolled-back change.
 */
@Entity('outbox_events')
@Index('ix_outbox_unpublished', ['publishedAt', 'createdAt'])
export class OutboxEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  destination: OutboxDestination;

  /** e.g. placement.stage_changed, bimasetu.qcr_round, mail.rfq_float */
  @Column({ name: 'event_type', type: 'text' })
  eventType: string;

  @Column({ name: 'aggregate_type', type: 'text' })
  aggregateType: string;

  @Column({ name: 'aggregate_id', type: 'uuid' })
  aggregateId: string;

  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  @Column({ name: 'correlation_id', type: 'text', nullable: true })
  correlationId: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError: string | null;
}
