import { Column, Entity, Index } from 'typeorm';
import { RevisionAsk, RevisionBy } from '@bimaplacement/contracts';
import { BaseEntity } from '../../../common/persistence/base.entity';

/**
 * BimaSetu revision request (FR-120/121, FR-287) - opens a new round on the same ticket.
 * No insurer is contacted until the PM acts (FR-250): restart threads / add insurer / RFQ V2.
 */
@Entity('revisions')
@Index('ux_revision_ticket_round', ['ticketId', 'round'], { unique: true })
export class Revision extends BaseEntity {
  @Column({ name: 'ticket_id', type: 'uuid' })
  ticketId: string;

  @Column({ type: 'int' })
  round: number;

  @Column({ name: 'qcr_version', type: 'int' })
  qcrVersion: number;

  @Column({ type: 'text' })
  by: RevisionBy;

  @Column({ type: 'text' })
  reason: string;

  @Column({ type: 'text', array: true })
  asks: RevisionAsk[];

  @Column({ name: 'bimasetu_message_id', type: 'text', nullable: true })
  bimasetuMessageId: string | null;

  @Column({ name: 'received_at', type: 'timestamptz' })
  receivedAt: Date;

  @Column({ name: 'handled_at', type: 'timestamptz', nullable: true })
  handledAt: Date | null;

  @Column({ name: 'handled_by_id', type: 'uuid', nullable: true })
  handledById: string | null;

  @Column({ name: 'handled_via', type: 'text', nullable: true })
  handledVia: 'restart_threads' | 'add_insurer' | 'new_rfq_version' | null;
}
