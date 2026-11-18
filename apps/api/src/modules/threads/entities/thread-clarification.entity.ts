import { Column, Entity } from 'typeorm';
import { BaseEntity } from '../../../common/persistence/base.entity';

/** Insurer clarification on a thread; may hold the thread clock while the RM answers (M7). */
@Entity('thread_clarifications')
export class ThreadClarification extends BaseEntity {
  @Column({ name: 'thread_id', type: 'uuid' })
  threadId: string;

  @Column({ type: 'text' })
  question: string;

  @Column({ name: 'asked_at', type: 'timestamptz' })
  askedAt: Date;

  @Column({ name: 'source_mail_id', type: 'uuid', nullable: true })
  sourceMailId: string | null;

  @Column({ name: 'rm_requested_at', type: 'timestamptz', nullable: true })
  rmRequestedAt: Date | null;

  @Column({ name: 'rm_request_text', type: 'text', nullable: true })
  rmRequestText: string | null;

  /** Ticket-scoped IR-nn sent to BimaSetu instead of the thread ref (FR-290); a query_answer comes back with it. */
  @Column({ name: 'rm_query_ref', type: 'text', nullable: true })
  rmQueryRef: string | null;

  @Column({ name: 'rm_response', type: 'text', nullable: true })
  rmResponse: string | null;

  @Column({ name: 'rm_responded_at', type: 'timestamptz', nullable: true })
  rmRespondedAt: Date | null;

  @Column({ name: 'reply_text', type: 'text', nullable: true })
  replyText: string | null;

  @Column({ name: 'replied_at', type: 'timestamptz', nullable: true })
  repliedAt: Date | null;
}
