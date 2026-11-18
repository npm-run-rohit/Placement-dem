import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Inbox (inbound) + delivery log (outbound) for every BimaSetu message (FR-291): unique id,
 * processed exactly once, retried, and shown on the ticket's Mail Trail > BimaSetu view.
 */
@Entity('bimasetu_messages')
@Index('ux_bimasetu_direction_msg', ['direction', 'messageId'], { unique: true })
@Index('ix_bimasetu_ticket', ['ticketId', 'createdAt'])
export class BimaSetuMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  direction: 'in' | 'out';

  /** Inbound: BimaSetu's messageId. Outbound: our outbox id (idempotency key sent to BimaSetu). */
  @Column({ name: 'message_id', type: 'text' })
  messageId: string;

  @Column({ type: 'text' })
  type: string;

  @Column({ name: 'line_ref', type: 'text', nullable: true })
  lineRef: string | null;

  @Column({ name: 'ticket_id', type: 'uuid', nullable: true })
  ticketId: string | null;

  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  @Column({ type: 'text', default: 'pending' })
  status: 'pending' | 'processed' | 'rejected' | 'failed' | 'sent';

  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt: Date | null;
}
