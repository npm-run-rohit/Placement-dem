import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import {
  BusinessType,
  Channel,
  InternalStatus,
  OutcomeType,
  ProductTypeCode,
  RiskTier,
  RmFacingStatus,
  SlaId,
  SlaOwnerType,
  Stage,
  Urgency,
} from '@bimaplacement/contracts';
import { BaseEntity, numericTransformer } from '../../../common/persistence/base.entity';
import { User } from '../../users/user.entity';

/**
 * Placement Ticket - the aggregate root (PRD 2.4, Appendix E.1).
 * One ticket per product type (FR-005/006). Placement core (TicketWorkflow) is the ONLY writer
 * of stage/status/SLA columns; every change goes through TicketWorkflow.run().
 */
@Entity('placement_tickets')
@Index('ix_ticket_stage_owner', ['stage', 'ownerId'])
export class PlacementTicket extends BaseEntity {
  // ---------- identity ----------
  /** PLC-nnnn, from sequence placement_ticket_no_seq (FR-004, FR-200). Immutable (BR-005). */
  @Index({ unique: true })
  @Column({ name: 'ticket_no', type: 'text' })
  ticketNo: string;

  @Column({ type: 'text' })
  channel: Channel; // immutable (BR-109)

  @Index({ unique: true, where: 'bimasetu_line_ref IS NOT NULL' })
  @Column({ name: 'bimasetu_line_ref', type: 'text', nullable: true })
  bimasetuLineRef: string | null;

  @Column({ name: 'client_ref', type: 'text', nullable: true })
  clientRef: string | null; // BimaSetu client id

  @Column({ name: 'opportunity_ref', type: 'text', nullable: true })
  opportunityRef: string | null;

  @Column({ name: 'created_by_id', type: 'uuid', nullable: true })
  createdById: string | null; // null when created by a BimaSetu float (RM recorded in rm_*)

  @Column({ name: 'owner_id', type: 'uuid' })
  ownerId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'owner_id' })
  owner: User;

  /** Owner moved to the Placement Head by SLA-P1 (FR-207); sticky until the Head reassigns (BR-113). */
  @Column({ type: 'boolean', default: false })
  escalated: boolean;

  @Column({ name: 'rm_user_id', type: 'uuid', nullable: true })
  rmUserId: string | null;

  @Column({ name: 'rm_name', type: 'text' })
  rmName: string;

  @Column({ name: 'rm_email', type: 'text', nullable: true })
  rmEmail: string | null;

  // ---------- intake (M1 3.3) ----------
  @Column({ name: 'business_name', type: 'text' })
  businessName: string;

  @Column({ name: 'industry_type', type: 'text' })
  industryType: string;

  @Column({ name: 'product_type', type: 'text' })
  productType: ProductTypeCode;

  /** Raw code as sent by BimaSetu when it is not on the product master ("Product not mapped"). */
  @Column({ name: 'product_type_raw', type: 'text', nullable: true })
  productTypeRaw: string | null;

  @Column({ name: 'business_type', type: 'text' })
  businessType: BusinessType;

  @Column({ name: 'business_type_at_intake', type: 'text' })
  businessTypeAtIntake: BusinessType; // BR-139: PM correction is not sent back to BimaSetu

  @Column({ name: 'renewal_date', type: 'date', nullable: true })
  renewalDate: string | null;

  @Column({ name: 'incumbent_insurer_id', type: 'uuid', nullable: true })
  incumbentInsurerId: string | null;

  @Column({ name: 'incumbent_insurer_text', type: 'text', nullable: true })
  incumbentInsurerText: string | null;

  @Column({ name: 'client_spoc', type: 'text', nullable: true })
  clientSpoc: string | null;

  @Column({ type: 'text', default: Urgency.MEDIUM })
  urgency: Urgency; // visibility only, never the clock

  @Column({
    name: 'target_premium',
    type: 'numeric',
    precision: 14,
    scale: 2,
    nullable: true,
    transformer: numericTransformer,
  })
  targetPremium: number | null;

  @Column({ name: 'note_to_placement', type: 'text', nullable: true })
  noteToPlacement: string | null;

  @Column({ name: 'received_at', type: 'timestamptz' })
  receivedAt: Date;

  // ---------- strategy ----------
  @Column({ name: 'risk_tier', type: 'text', nullable: true })
  riskTier: RiskTier | null;

  // ---------- progress ----------
  @Column({ type: 'text' })
  stage: Stage;

  /** Denormalised derived status (StatusDeriver) for list filters + BimaSetu stage sync. */
  @Column({ name: 'internal_status', type: 'text' })
  internalStatus: InternalStatus;

  @Column({ name: 'rm_status', type: 'text' })
  rmStatus: RmFacingStatus;

  @Column({ name: 'active_rfq_version', type: 'int', default: 1 })
  activeRfqVersion: number;

  @Column({ name: 'panel_locked', type: 'boolean', default: false })
  panelLocked: boolean;

  /** High-water mark for TH-nn; never reset, even on RFQ V2 (FR-054, FR-253). */
  @Column({ name: 'thread_seq', type: 'int', default: 0 })
  threadSeq: number;

  @Column({ name: 'qcr_round', type: 'int', default: 1 })
  qcrRound: number;

  @Column({ name: 'mandate_request_seq', type: 'int', default: 0 })
  mandateRequestSeq: number;

  @Column({ name: 'follow_ups_stopped', type: 'boolean', default: false })
  followUpsStopped: boolean;

  // ---------- active ticket clock (one at a time, FR-222) ----------
  @Column({ name: 'sla_id', type: 'text', nullable: true })
  slaId: SlaId | null;

  @Column({ name: 'sla_owner_type', type: 'text', nullable: true })
  slaOwnerType: SlaOwnerType | null;

  @Column({ name: 'sla_anchor_at', type: 'timestamptz', nullable: true })
  slaAnchorAt: Date | null;

  @Column({ name: 'sla_target_mins', type: 'int', nullable: true })
  slaTargetMins: number | null;

  /** Precomputed breach instant (anchor + target in business time) - indexed for the sweeper. */
  @Index('ix_ticket_sla_due')
  @Column({ name: 'sla_due_at', type: 'timestamptz', nullable: true })
  slaDueAt: Date | null;

  // ---------- SLA-P1 ladder state ----------
  @Column({ name: 'p1_armed_at', type: 'timestamptz', nullable: true })
  p1ArmedAt: Date | null;

  @Column({ name: 'p1_reminders_sent', type: 'int', default: 0 })
  p1RemindersSent: number;

  @Column({ name: 'p1_escalated_at', type: 'timestamptz', nullable: true })
  p1EscalatedAt: Date | null;

  // ---------- outcome (terminal) ----------
  @Column({ name: 'outcome_type', type: 'text', nullable: true })
  outcomeType: OutcomeType | null;

  @Column({ name: 'outcome', type: 'jsonb', nullable: true })
  outcome: {
    reason?: string;
    insurerId?: string;
    quoteId?: string;
    qcrVersion?: number;
    premium?: number | null;
    decidedBy: string;
    source: 'bimasetu' | 'manual';
  } | null;

  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt: Date | null;

  /** Original float payload for traceability (FR-008). */
  @Column({ name: 'float_payload', type: 'jsonb', nullable: true })
  floatPayload: Record<string, unknown> | null;

  /** Optional link to a previous terminal ticket for a returning client (BR-006). */
  @Column({ name: 'previous_ticket_id', type: 'uuid', nullable: true })
  previousTicketId: string | null;
}
