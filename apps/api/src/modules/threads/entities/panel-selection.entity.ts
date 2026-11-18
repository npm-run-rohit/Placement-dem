import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** Pre-float insurer + branch selection (M4). Becomes threads on float; panel then locks. */
@Entity('panel_selections')
@Index('ux_panel_ticket_entity', ['ticketId', 'rfqVersion', 'insurerId', 'branchId'], { unique: true })
export class PanelSelection {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'ticket_id', type: 'uuid' })
  ticketId: string;

  @Column({ name: 'rfq_version', type: 'int' })
  rfqVersion: number;

  @Column({ name: 'insurer_id', type: 'uuid' })
  insurerId: string;

  @Column({ name: 'branch_id', type: 'uuid' })
  branchId: string;

  @Column({ name: 'selected_by_id', type: 'uuid' })
  selectedById: string;

  @CreateDateColumn({ name: 'selected_at', type: 'timestamptz' })
  selectedAt: Date;
}
