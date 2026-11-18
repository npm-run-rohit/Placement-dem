import { Column, Entity, Index, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { BranchStatus } from '@bimaplacement/contracts';
import { BaseEntity } from '../../../common/persistence/base.entity';
import { Insurer } from './insurer.entity';
import { InsurerPoc } from './insurer-poc.entity';

/**
 * Branch (Appendix C #07). Insurer + branch is the selectable unit and one thread (BR-127).
 * name = '' means "the insurer as a whole" when the master has no branch.
 */
@Entity('insurer_branches')
@Index('ux_branch_insurer_name', ['insurerId', 'name'], { unique: true })
export class InsurerBranch extends BaseEntity {
  @Column({ name: 'insurer_id', type: 'uuid' })
  insurerId: string;

  @ManyToOne(() => Insurer, (i) => i.branches)
  @JoinColumn({ name: 'insurer_id' })
  insurer: Insurer;

  @Column({ type: 'text', default: '' })
  name: string;

  @Column({ type: 'text', nullable: true })
  city: string | null;

  @Column({ type: 'text', nullable: true })
  address: string | null;

  @Column({ type: 'text', default: BranchStatus.ACTIVE })
  status: BranchStatus;

  @OneToMany(() => InsurerPoc, (p) => p.branch)
  pocs: InsurerPoc[];
}
