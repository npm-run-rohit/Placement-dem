import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { ActorType } from '@bimaplacement/contracts';

/** Chronological thread timeline (FR-055, FR-079). Append-only. */
@Entity('thread_events')
@Index('ix_thread_event_thread_at', ['threadId', 'at'])
export class ThreadEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'thread_id', type: 'uuid' })
  threadId: string;

  @Column({ type: 'text' })
  kind: string; // rfq_sent | follow_up | escalation | ack | clarification | hold | resume | quote | decline | call | restart | note

  @Column({ name: 'actor_type', type: 'text' })
  actorType: ActorType;

  @Column({ name: 'actor_id', type: 'text', nullable: true })
  actorId: string | null;

  @Column({ type: 'text' })
  text: string;

  @Column({ name: 'mail_message_id', type: 'uuid', nullable: true })
  mailMessageId: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  at: Date;
}
