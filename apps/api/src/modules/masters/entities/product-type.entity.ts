import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { ProductGroup, ProductTypeCode, TimingLob } from '@bimaplacement/contracts';

/** Product Type master (Appendix C #01) - each maps to exactly one RFQ template (BR-104). */
@Entity('product_types')
export class ProductType {
  @PrimaryColumn({ type: 'text' })
  code: ProductTypeCode;

  @Column({ name: 'product_group', type: 'text' })
  group: ProductGroup;

  @Column({ name: 'short_label', type: 'text' })
  short: string;

  @Column({ type: 'text' })
  label: string;

  @Column({ name: 'rfq_template', type: 'text' })
  rfqTemplate: string;

  @Column({ name: 'timing_lob', type: 'text' })
  timingLob: TimingLob;

  /** Email-bot aliases (FR-230, FR-254). */
  @Column({ type: 'text', array: true, default: '{}' })
  aliases: string[];

  /** Codes BimaSetu may send for this product (FR-282 - mapping table, "Product not mapped" otherwise). */
  @Column({ name: 'bimasetu_codes', type: 'text', array: true, default: '{}' })
  bimasetuCodes: string[];

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
