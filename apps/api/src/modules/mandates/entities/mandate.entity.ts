import { Column, Entity } from 'typeorm';
import { MandateType } from '@bimaplacement/contracts';
import { BaseEntity } from '../../../common/persistence/base.entity';

/**
 * Mandate on file (PRD M4): Exclusive Placement Mandate (display-only, FR-216) or
 * Incumbent Approach Mandate (unblocks the incumbent on a Rollover, BR-026).
 */
@Entity('mandates')
export class Mandate extends BaseEntity {
  @Column({ name: 'ticket_id', type: 'uuid' })
  ticketId: string;

  @Column({ type: 'text' })
  type: MandateType;

  @Column({ type: 'text' })
  reference: string; // MND-<n>-E | MND-<n>-A

  @Column({ name: 'preferred_insurer_id', type: 'uuid', nullable: true })
  preferredInsurerId: string | null;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  @Column({ type: 'text' })
  source: 'bimasetu_float' | 'mandate_request' | 'manual_upload';

  @Column({ name: 'proof_document_id', type: 'uuid', nullable: true })
  proofDocumentId: string | null;

  @Column({ name: 'mandate_request_id', type: 'uuid', nullable: true })
  mandateRequestId: string | null;

  @Column({ name: 'signed_at', type: 'timestamptz', nullable: true })
  signedAt: Date | null;

  @Column({ name: 'recorded_by_id', type: 'uuid', nullable: true })
  recordedById: string | null;
}
