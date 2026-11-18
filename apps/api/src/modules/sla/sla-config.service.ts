import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  BUSINESS_CALENDAR_DEFAULTS,
  QUOTE_TARGET_MATRIX_SEED,
  SLA_MASTER_SEED,
  SLA_P1_DEFAULTS,
  SlaId,
  SlaOwnerType,
  THRESHOLD_DEFAULTS,
  FOLLOW_UP_LADDER_DEFAULTS,
} from '@bimaplacement/contracts';
import { BusinessCalendar } from '../../common/time/business-calendar';
import { Holiday } from '../masters/entities/holiday.entity';
import { SlaDefinition } from '../masters/entities/sla-definition.entity';
import { QuoteTarget } from '../masters/entities/quote-target.entity';
import { AppSetting } from '../masters/entities/app-setting.entity';
import type { QuoteTargetMatrix } from './quote-target.resolver';

/**
 * Cached SLA configuration loaded from the masters (SLA definitions, matrix, holidays, settings).
 * Falls back to PRD seed values so the app runs before the masters are seeded.
 * Call refresh() after Admin edits (MastersService does) - applies prospectively (BR-091). Other processes
 * (worker, other API instances) pick the edit up within a minute: every master save writes master_change_log,
 * and refreshIfChanged() polls its latest timestamp.
 */
@Injectable()
export class SlaConfigService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(SlaConfigService.name);
  private stamp: string | null = null;
  private poll?: NodeJS.Timeout;
  calendar = BusinessCalendar.withDefaults();
  definitions = new Map<SlaId, { targetMins: number; ownerType: SlaOwnerType; touchpoint: string }>(
    SLA_MASTER_SEED.map((d) => [
      d.id,
      { targetMins: d.targetMins, ownerType: d.ownerType, touchpoint: d.touchpoint },
    ]),
  );
  matrix: QuoteTargetMatrix = QUOTE_TARGET_MATRIX_SEED;
  thresholds: {
    usableQuoteThreshold: number;
    dueSoonBusinessMins: number;
    slaRiskBusinessMins: number;
    atRiskFraction: number;
  } = { ...THRESHOLD_DEFAULTS };
  slaP1: { reminderIntervalMins: number; remindersBeforeEscalation: number } = { ...SLA_P1_DEFAULTS };
  followUpLadder: Array<{ step: number; afterBusinessDays: number; label: string; templateId: string }> =
    FOLLOW_UP_LADDER_DEFAULTS.map((s) => ({ ...s }));

  constructor(private readonly dataSource: DataSource) {}

  async onModuleInit() {
    try {
      await this.refresh();
    } catch (e) {
      this.logger.warn(`SLA config not loaded from DB, using PRD defaults: ${(e as Error).message}`);
    }
    this.poll = setInterval(() => {
      this.refreshIfChanged().catch((e) =>
        this.logger.warn(`SLA config poll failed: ${(e as Error).message}`),
      );
    }, 60_000);
    this.poll.unref();
  }

  onModuleDestroy() {
    clearInterval(this.poll);
  }

  /** Reloads when a master changed since the last load (cheap: one indexed max()). */
  async refreshIfChanged() {
    if ((await this.latestChange()) !== this.stamp) await this.refresh();
  }

  private async latestChange(): Promise<string | null> {
    const [row] = await this.dataSource.query(`SELECT max(changed_at)::text AS at FROM master_change_log`);
    return row?.at ?? null;
  }

  async refresh() {
    this.stamp = await this.latestChange();
    const holidays = await this.dataSource.getRepository(Holiday).find({ where: { active: true } });
    const settings = await this.dataSource.getRepository(AppSetting).find();
    // app_settings rows (jsonb) as the admin saved them; each key is optional and merged over the PRD defaults
    const s = Object.fromEntries(settings.map((x) => [x.key, x.value])) as {
      business_calendar?: Partial<typeof BUSINESS_CALENDAR_DEFAULTS>;
      thresholds?: Partial<SlaConfigService['thresholds']>;
      sla_p1?: Partial<SlaConfigService['slaP1']>;
      follow_up_ladder?: SlaConfigService['followUpLadder'];
    };
    const cal = { ...BUSINESS_CALENDAR_DEFAULTS, ...(s.business_calendar ?? {}) };
    this.calendar = new BusinessCalendar({
      ...cal,
      workdays: [...cal.workdays],
      holidays: holidays.map((h) => h.date),
    });
    if (s.thresholds) this.thresholds = { ...this.thresholds, ...s.thresholds };
    if (s.sla_p1) this.slaP1 = { ...this.slaP1, ...s.sla_p1 };
    if (s.follow_up_ladder) this.followUpLadder = s.follow_up_ladder;

    const defs = await this.dataSource.getRepository(SlaDefinition).find({ where: { active: true } });
    for (const d of defs)
      this.definitions.set(d.id, {
        targetMins: d.targetMins,
        ownerType: d.ownerType,
        touchpoint: d.touchpoint,
      });

    const cells = await this.dataSource.getRepository(QuoteTarget).find();
    if (cells.length) {
      const m: Record<string, Record<string, number>> = {};
      for (const c of cells) (m[c.timingLob] ??= {})[c.scenario] = c.businessDays;
      this.matrix = m as QuoteTargetMatrix;
    }
  }
}
