import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * SLA history (M6 audit: start/pause/resume/stop, reminders, escalations). Lets reporting compute
 * breaches by stage and turnaround without replaying the audit log. Append-only.
 */
@Entity('sla_events')
@Index('ix_sla_event_ticket', ['ticketId', 'at'])
export class SlaEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'ticket_id', type: 'uuid' })
  ticketId: string;

  @Column({ name: 'thread_id', type: 'uuid', nullable: true })
  threadId: string | null;

  @Column({ name: 'sla_id', type: 'text' })
  slaId: string;

  @Column({ type: 'text' })
  kind:
    | 'started'
    | 'stopped'
    | 'held'
    | 'resumed'
    | 'breached'
    | 'p1_reminder'
    | 'p1_escalated'
    | 'p1_cancelled'
    | 'follow_up'
    | 'auto_stop';

  @Column({ type: 'jsonb', default: {} })
  data: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  at: Date;
}
