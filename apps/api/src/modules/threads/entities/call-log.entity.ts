import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** Optional Log Call action (FR-060). */
@Entity('call_logs')
export class CallLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'thread_id', type: 'uuid' })
  threadId: string;

  @Column({ type: 'text' })
  outcome: string;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'next_follow_up_at', type: 'timestamptz', nullable: true })
  nextFollowUpAt: Date | null;

  @Column({ name: 'logged_by_id', type: 'uuid' })
  loggedById: string;

  @CreateDateColumn({ name: 'logged_at', type: 'timestamptz' })
  loggedAt: Date;
}
