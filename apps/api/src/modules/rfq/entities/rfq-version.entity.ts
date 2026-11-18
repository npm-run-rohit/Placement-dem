import { Column, Entity, Index } from 'typeorm';
import { RfqStatus } from '@bimaplacement/contracts';
import { BaseEntity } from '../../../common/persistence/base.entity';

/**
 * RFQ Version - immutable requirement snapshot once floated (BR-034, Appendix E.2).
 * The RFQ is stored and sent AS RECEIVED: Excel and/or link; never parsed (BR-107, FR-199).
 */
@Entity('rfq_versions')
@Index('ux_rfq_ticket_version', ['ticketId', 'version'], { unique: true })
export class RfqVersion extends BaseEntity {
  @Column({ name: 'ticket_id', type: 'uuid' })
  ticketId: string;

  @Column({ type: 'int' })
  version: number;

  @Column({ type: 'text', default: RfqStatus.IN_REVIEW })
  status: RfqStatus;

  @Column({ name: 'excel_document_id', type: 'uuid', nullable: true })
  excelDocumentId: string | null;

  @Column({ name: 'link_url', type: 'text', nullable: true })
  linkUrl: string | null;

  /** Optional BimaSetu "rendered view" of the RFQ (4A Float) for the read-only sheet viewer. */
  @Column({ name: 'rendered_view_url', type: 'text', nullable: true })
  renderedViewUrl: string | null;

  @Column({ name: 'change_note', type: 'text', nullable: true })
  changeNote: string | null; // required for V2+ (M11)

  @Column({ name: 'created_by_id', type: 'uuid', nullable: true })
  createdById: string | null;

  @Column({ name: 'validated_at', type: 'timestamptz', nullable: true })
  validatedAt: Date | null;

  @Column({ name: 'validated_by_id', type: 'uuid', nullable: true })
  validatedById: string | null;

  @Column({ name: 'floated_at', type: 'timestamptz', nullable: true })
  floatedAt: Date | null;
}
