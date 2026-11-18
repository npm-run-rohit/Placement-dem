import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type LookupKind =
  | 'industry_type'
  | 'business_type'
  | 'urgency'
  | 'risk_tier'
  | 'early_release_reason'
  | 'mandate_request_reason'
  | 'mandate_decline_reason'
  | 'closure_reason'
  | 'rejection_reason'
  | 'exclusion_reason';

/**
 * Generic configurable list (Appendix C #02-05, 11, 12, 18, 19). Values are retired
 * (active=false), never deleted, so historical references survive (BR-091, 10.6).
 */
@Entity('lookup_values')
@Index('ux_lookup_kind_value', ['kind', 'value'], { unique: true })
export class LookupValue {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'text' })
  kind: LookupKind;

  @Column({ type: 'text' })
  value: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  /** Extra data (e.g. rejection taxonomy route, broad reason). */
  @Column({ type: 'jsonb', default: {} })
  meta: Record<string, unknown>;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder: number;
}
