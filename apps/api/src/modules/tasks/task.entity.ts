import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from '../../common/persistence/base.entity';

/** Human work item (Appendix E, FR-059 call tasks, FR-250 revision task). Feeds the Inbox view. */
@Entity('tasks')
@Index('ix_task_assignee_status', ['assigneeId', 'status'])
export class Task extends BaseEntity {
  @Column({ name: 'ticket_id', type: 'uuid' })
  ticketId: string;

  @Column({ name: 'thread_id', type: 'uuid', nullable: true })
  threadId: string | null;

  @Column({ type: 'text' })
  kind: 'call_insurer' | 'revision_request' | 'reply_insurer' | 'review_quote' | 'other';

  @Column({ type: 'text' })
  label: string;

  @Column({ name: 'assignee_id', type: 'uuid' })
  assigneeId: string;

  @Column({ name: 'due_at', type: 'timestamptz', nullable: true })
  dueAt: Date | null;

  @Column({ type: 'text', default: 'open' })
  status: 'open' | 'done' | 'cancelled';

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt: Date | null;
}
