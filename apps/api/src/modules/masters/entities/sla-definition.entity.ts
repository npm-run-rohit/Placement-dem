import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { SlaId, SlaOwnerType } from '@bimaplacement/contracts';

/** SLA master (Appendix C #13, PRD 8.3). */
@Entity('sla_definitions')
export class SlaDefinition {
  @PrimaryColumn({ type: 'text' })
  id: SlaId;

  @Column({ type: 'text' })
  touchpoint: string;

  @Column({ type: 'text' })
  owner: string;

  @Column({ name: 'target_mins', type: 'int' })
  targetMins: number;

  @Column({ name: 'owner_type', type: 'text' })
  ownerType: SlaOwnerType;

  @Column({ name: 'target_text', type: 'text' })
  targetText: string;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
