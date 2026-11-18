import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { ProductGroup } from '@bimaplacement/contracts';
import { BaseEntity } from '../../../common/persistence/base.entity';
import { InsurerBranch } from './insurer-branch.entity';

/**
 * Insurer POC (Appendix C #08). Routing key Insurer + Branch + Product Group (FR-162).
 * Every POC gets every mail on the thread, all in To; no senior/escalation contact (FR-034).
 * `routing` holds extra configurable routing attributes (FR-163) without schema changes.
 */
@Entity('insurer_pocs')
@Index('ix_poc_branch_group', ['branchId', 'productGroup'])
export class InsurerPoc extends BaseEntity {
  @Column({ name: 'branch_id', type: 'uuid' })
  branchId: string;

  @ManyToOne(() => InsurerBranch, (b) => b.pocs)
  @JoinColumn({ name: 'branch_id' })
  branch: InsurerBranch;

  @Column({ name: 'product_group', type: 'text' })
  productGroup: ProductGroup;

  @Column({ type: 'text' })
  name: string;

  @Column({ type: 'text', nullable: true })
  designation: string | null;

  @Column({ type: 'text', nullable: true })
  phone: string | null;

  @Column({ type: 'text' })
  email: string;

  @Column({ name: 'cc_emails', type: 'text', array: true, default: '{}' })
  ccEmails: string[];

  @Column({ type: 'jsonb', default: {} })
  routing: Record<string, string>;

  @Column({ type: 'boolean', default: true })
  active: boolean;
}
