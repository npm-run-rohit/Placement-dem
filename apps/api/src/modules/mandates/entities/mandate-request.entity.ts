import { Column, Entity, Index } from 'typeorm';
import { MandateRequestStatus } from '@bimaplacement/contracts';
import { BaseEntity } from '../../../common/persistence/base.entity';

/** Exclusive Placement Mandate request to the RM, MR-nn (FR-276..280). One open at a time (BR-135). */
@Entity('mandate_requests')
@Index('ux_mandate_request_open', ['ticketId'], {
  unique: true,
  where: "status IN ('requested','considering')",
})
export class MandateRequest extends BaseEntity {
  @Column({ name: 'ticket_id', type: 'uuid' })
  ticketId: string;

  @Column({ type: 'text' })
  ref: string; // MR-01

  @Column({ type: 'text', default: MandateRequestStatus.REQUESTED })
  status: MandateRequestStatus;

  @Column({ type: 'text' })
  reason: string;

  @Column({ name: 'preferred_insurer_id', type: 'uuid', nullable: true })
  preferredInsurerId: string | null;

  @Column({ type: 'text' })
  message: string;

  @Column({ name: 'requested_by_id', type: 'uuid' })
  requestedById: string;

  @Column({ name: 'requested_at', type: 'timestamptz' })
  requestedAt: Date;

  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt: Date | null;

  /** Reminders + RM responses (considering/signed/declined) + withdrawal, chronological. */
  @Column({ type: 'jsonb', default: [] })
  events: Array<{
    kind: 'reminder' | 'considering' | 'signed' | 'declined' | 'withdrawn';
    at: string;
    by: string;
    note?: string;
    reason?: string;
  }>;
}
