import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Typed key/value config editable from Admin without a deploy (BR-089):
 *  - business_calendar  {timezone, workdays, dayStart, dayEnd}
 *  - thresholds         {usableQuoteThreshold, dueSoonBusinessMins, slaRiskBusinessMins}
 *  - follow_up_ladder   [{step, afterBusinessDays, templateId}]
 *  - sla_p1             {reminderIntervalMins, remindersBeforeEscalation}
 *  - upload_rules       {rfqAccept: string[], qcrAccept: string[] | null}
 *  - assignment_rule    {strategy: 'head_fallback' | 'round_robin' | ...}
 *  - copycat            {mode, endpoint, timeoutMs}   (secrets stay in Secrets Manager)
 */
@Entity('app_settings')
export class AppSetting {
  @PrimaryColumn({ type: 'text' })
  key: string;

  @Column({ type: 'jsonb' })
  value: unknown;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy: string | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
