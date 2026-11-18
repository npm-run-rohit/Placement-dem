import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Communication Template master (Appendix C #22; M6 s12): INS-T01..T06, RM-T01.., INT-T01..
 * Handlebars-style {{placeholders}}; rendered by CommunicationsService.
 */
@Entity('communication_templates')
export class CommunicationTemplate {
  @PrimaryColumn({ type: 'text' })
  id: string; // 'INS-T01'

  @Column({ type: 'text' })
  audience: 'insurer' | 'rm' | 'internal';

  @Column({ type: 'text' })
  trigger: string;

  @Column({ name: 'subject_template', type: 'text' })
  subjectTemplate: string;

  @Column({ name: 'body_template', type: 'text' })
  bodyTemplate: string;

  @Column({ name: 'cc_rule', type: 'jsonb', default: {} })
  ccRule: Record<string, unknown>;

  @Column({ type: 'text', array: true, default: '{}' })
  channels: string[];

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
