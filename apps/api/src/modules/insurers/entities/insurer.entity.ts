import { Column, Entity, Index, OneToMany } from 'typeorm';
import { InsurerStatus, ProductTypeCode } from '@bimaplacement/contracts';
import { BaseEntity } from '../../../common/persistence/base.entity';
import { InsurerBranch } from './insurer-branch.entity';

/** Insurer master (Appendix C #06). Status applies to all branches (FR-035). Editable by Placement Head only. */
@Entity('insurers')
export class Insurer extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'text' })
  code: string; // 'icici'

  @Column({ type: 'text' })
  name: string;

  @Column({ name: 'broking_code', type: 'text', nullable: true })
  brokingCode: string | null;

  @Column({ type: 'text', default: InsurerStatus.ACTIVE })
  status: InsurerStatus;

  @Column({ name: 'logo_url', type: 'text', nullable: true })
  logoUrl: string | null;

  @Column({ type: 'text', nullable: true })
  sectors: string | null;

  @Column({ type: 'text', nullable: true })
  note: string | null;

  /** Appetite chips (Appendix C #09) - hint only, never blocks selection (FR-210). */
  @Column({ type: 'text', array: true, default: '{}' })
  appetite: ProductTypeCode[];

  @OneToMany(() => InsurerBranch, (b) => b.insurer)
  branches: InsurerBranch[];
}
