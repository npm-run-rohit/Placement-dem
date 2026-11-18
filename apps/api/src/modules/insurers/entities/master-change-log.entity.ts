import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** Before/after history for every master edit (FR-044, FR-148, FR-161). Append-only. */
@Entity('master_change_log')
@Index('ix_master_change_entity', ['entityType', 'entityId'])
@Index('ix_master_change_at', ['changedAt'])
export class MasterChangeLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'entity_type', type: 'text' })
  entityType: string; // insurer | branch | poc | product_type | sla_definition | app_setting | ...

  @Column({ name: 'entity_id', type: 'text' })
  entityId: string;

  @Column({ name: 'entity_label', type: 'text' })
  entityLabel: string;

  @Column({ type: 'text' })
  field: string;

  @Column({ type: 'jsonb', nullable: true })
  before: any; // eslint-disable-line @typescript-eslint/no-explicit-any

  @Column({ type: 'jsonb', nullable: true })
  after: any; // eslint-disable-line @typescript-eslint/no-explicit-any

  @Column({ name: 'changed_by', type: 'uuid' })
  changedBy: string;

  @CreateDateColumn({ name: 'changed_at', type: 'timestamptz' })
  changedAt: Date;
}
