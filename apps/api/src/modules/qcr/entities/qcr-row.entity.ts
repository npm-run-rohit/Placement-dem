import { Column, Entity, Index } from 'typeorm';
import { BaseEntity, numericTransformer } from '../../../common/persistence/base.entity';
import type { RowAutofill } from '../row-values';

/**
 * Quote row delivered to BimaSetu with the QCR round (FR-285/286). From Copycat output,
 * PM-checked; PM fills them for single-quote / manual QCRs. Any edit clears rows_checked.
 */
@Entity('qcr_rows')
@Index('ux_qcr_row_quote', ['qcrId', 'quoteId'], { unique: true })
export class QcrRow extends BaseEntity {
  @Column({ name: 'qcr_id', type: 'uuid' })
  qcrId: string;

  @Column({ name: 'quote_id', type: 'uuid' })
  quoteId: string;

  @Column({ name: 'insurer_id', type: 'uuid' })
  insurerId: string;

  @Column({ name: 'insurer_name', type: 'text' })
  insurerName: string;

  @Column({ type: 'numeric', precision: 14, scale: 2, nullable: true, transformer: numericTransformer })
  premium: number | null;

  @Column({ name: 'sum_insured', type: 'text', nullable: true })
  sumInsured: string | null;

  @Column({ name: 'validity_date', type: 'date', nullable: true })
  validityDate: string | null;

  @Column({ name: 'terms_note', type: 'text', nullable: true })
  termsNote: string | null;

  /** Per field, what the system filled in and from where (Copycat's QCR or the quote record). */
  @Column({ type: 'jsonb', default: {} })
  autofill: RowAutofill;

  /** Fields the PM has changed away from the autofilled value. */
  @Column({ type: 'text', array: true, default: '{}' })
  edited: string[];
}
