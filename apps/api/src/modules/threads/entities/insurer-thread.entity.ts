import { Column, Entity, Index } from 'typeorm';
import { ThreadStatus } from '@bimaplacement/contracts';
import { BaseEntity } from '../../../common/persistence/base.entity';

/**
 * Insurer Thread - one per insurer + branch per RFQ version (BR-030, FR-045). Independent
 * status, clock and history; one thread's event never overwrites the ticket (PRD 5).
 */
@Entity('insurer_threads')
@Index('ux_thread_ticket_ref', ['ticketId', 'threadRef'], { unique: true })
export class InsurerThread extends BaseEntity {
  @Column({ name: 'ticket_id', type: 'uuid' })
  ticketId: string;

  /** TH-nn - never reused on a ticket (FR-054). */
  @Column({ name: 'thread_ref', type: 'text' })
  threadRef: string;

  @Column({ name: 'rfq_version', type: 'int' })
  rfqVersion: number;

  @Column({ name: 'insurer_id', type: 'uuid' })
  insurerId: string;

  @Column({ name: 'branch_id', type: 'uuid' })
  branchId: string;

  /** POC snapshot at send time (all in To) - master edits later do not rewrite history. */
  @Column({ type: 'jsonb' })
  pocs: Array<{ pocId: string; name: string; email: string }>;

  @Column({ name: 'cc_emails', type: 'text', array: true, default: '{}' })
  ccEmails: string[];

  @Column({ type: 'text', default: ThreadStatus.RFQ_SENT })
  status: ThreadStatus;

  @Column({ name: 'added_after_float', type: 'boolean', default: false })
  addedAfterFloat: boolean;

  // ---- insurer clock (SLA-06 matrix target), held while waiting on RM (FR-063/064) ----
  @Column({ name: 'floated_at', type: 'timestamptz', nullable: true })
  floatedAt: Date | null;

  @Column({ name: 'target_mins', type: 'int' })
  targetMins: number;

  @Column({ name: 'held_mins', type: 'int', default: 0 })
  heldMins: number;

  @Column({ name: 'paused_since', type: 'timestamptz', nullable: true })
  pausedSince: Date | null;

  @Column({ name: 'pause_reason', type: 'text', nullable: true })
  pauseReason: string | null;

  // ---- follow-up ladder ----
  @Column({ name: 'follow_ups_sent', type: 'int', default: 0 })
  followUpsSent: number;

  @Column({ name: 'follow_ups_active', type: 'boolean', default: true })
  followUpsActive: boolean;

  @Column({ name: 'decline_reason', type: 'text', nullable: true })
  declineReason: string | null;

  /** Provider thread id in the PM mailbox, for replies in the same conversation. */
  @Column({ name: 'mail_thread_id', type: 'text', nullable: true })
  mailThreadId: string | null;

  @Column({ name: 'last_event_at', type: 'timestamptz', nullable: true })
  lastEventAt: Date | null;
}
