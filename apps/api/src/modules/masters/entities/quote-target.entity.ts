import { Column, Entity, PrimaryColumn } from 'typeorm';
import { QuoteTargetScenario, TimingLob } from '@bimaplacement/contracts';
import { numericTransformer } from '../../../common/persistence/base.entity';

/** SLA-06 quote-collection matrix (Appendix C #14) - business days per LOB x scenario. */
@Entity('quote_target_matrix')
export class QuoteTarget {
  @PrimaryColumn({ name: 'timing_lob', type: 'text' })
  timingLob: TimingLob;

  @PrimaryColumn({ type: 'text' })
  scenario: QuoteTargetScenario;

  @Column({ name: 'business_days', type: 'numeric', precision: 4, scale: 1, transformer: numericTransformer })
  businessDays: number;
}
