import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  OutcomeType,
  SlaId,
  STAGE_META,
  Stage,
  ThreadStatus,
  type ProgressRange,
  type ProgressView,
  type ReportsView,
  type TeamDashboard,
} from '@bimaplacement/contracts';
import { DomainError } from '../../common/errors/domain-error';
import { computeProgress, type SlaEventRow } from './progress';
import { teamDashboard, type TeamTicket } from './team';
import { isHead, type AuthUser } from '../../common/auth/auth.types';
import { Clock } from '../../common/time/clock';
import { SlaConfigService } from '../sla/sla-config.service';
import { slaClockView } from '../tickets/domain/sla-view';
import { PlacementTicket } from '../tickets/entities/placement-ticket.entity';

const TREND_SLICES = 8;
const RANGE_DAYS: Record<Exclude<ProgressRange, 'custom'>, number> = { week: 7, month: 30, quarter: 91 };
const QUOTED = [
  ThreadStatus.QUOTE_RECEIVED,
  ThreadStatus.QUOTE_USABLE,
  ThreadStatus.QUOTE_CLARIFICATION,
  ThreadStatus.QUOTE_EXCLUDED,
];

/** PRD 9.4 funnel steps in order; `null` sql = a step Placement cannot observe (it happens in BimaSetu). */
const FUNNEL: Array<{ step: string; definition: string; sql: string | null }> = [
  { step: 'RFQ Submitted', definition: 'Placement ticket created (mail or manual ticket).', sql: 'true' },
  {
    step: 'RFQ Complete',
    definition: 'RFQ validated with zero open queries and risk tier set.',
    sql: 'EXISTS (SELECT 1 FROM rfq_versions v WHERE v.ticket_id = t.id AND v.validated_at IS NOT NULL)',
  },
  {
    step: 'Insurers Approved',
    definition: 'PM approved outreach.',
    sql: `EXISTS (SELECT 1 FROM sla_events e WHERE e.ticket_id = t.id AND e.sla_id = '${SlaId.SLA_05}' AND e.kind = 'started')`,
  },
  {
    step: 'RFQ Floated',
    definition: 'At least one insurer RFQ sent.',
    sql: 'EXISTS (SELECT 1 FROM insurer_threads th WHERE th.ticket_id = t.id)',
  },
  {
    step: 'First Usable Quote',
    definition: 'First PM-validated quote.',
    sql: `EXISTS (SELECT 1 FROM quotes q WHERE q.ticket_id = t.id AND q.decision = 'usable')`,
  },
  {
    step: 'Three Usable Quotes / Override',
    definition: 'Normal threshold (three insurer companies) or exception release.',
    sql: 'EXISTS (SELECT 1 FROM qcr_versions c WHERE c.ticket_id = t.id)',
  },
  {
    step: 'QCR Released',
    definition: 'PM sent QCR to RM.',
    sql: 'EXISTS (SELECT 1 FROM qcr_versions c WHERE c.ticket_id = t.id AND c.released_at IS NOT NULL)',
  },
  { step: 'Sent to Client', definition: 'RM sent the client the QCR (tracked in BimaSetu).', sql: null },
  {
    step: 'Quote Selected',
    definition: 'Ticket closed Quote selected from the BimaSetu client confirmation.',
    sql: `t.outcome_type = '${OutcomeType.QUOTE_SELECTED}'`,
  },
];

/**
 * Reports screen (UI-SPEC 3.6, PRD 9.4/9.5, FR-255) as aggregates on the primary DB (read replica later,
 * PLAN 4.3). Dashboards derive from system records, not spreadsheets (BR-095). Scope follows the queue:
 * the Head sees every ticket, a PM never counts Head-owned escalated tickets (FR-208).
 */
@Injectable()
export class ReportingService {
  constructor(
    private readonly ds: DataSource,
    private readonly sla: SlaConfigService,
    private readonly clock: Clock,
  ) {}

  async report(user: AuthUser): Promise<ReportsView> {
    const head = isHead(user);
    const scopeSql = head ? 'true' : 't.escalated = false';
    const tickets = await this.ds
      .getRepository(PlacementTicket)
      .createQueryBuilder('t')
      .leftJoinAndSelect('t.owner', 'owner')
      .where(scopeSql)
      .getMany();
    const ids = tickets.map((t) => t.id);
    const active = tickets.filter((t) => t.stage !== Stage.CLOSED);
    const closed = tickets.filter((t) => t.stage === Stage.CLOSED);

    // SLA: only the live internal clock counts; external waits are owned by RM / client / insurer (BR-118).
    const now = this.clock.now();
    let breached = 0;
    let underAnHour = 0;
    const breachStage = new Map<Stage, number>();
    const clockState = new Map<string, { breached: boolean; underAnHour: boolean }>();
    for (const t of active) {
      const s = slaClockView(t, this.sla.calendar, now);
      if (s.ownerType !== 'internal' || s.remainingMins === null) continue;
      if (s.breached) {
        breached++;
        breachStage.set(t.stage, (breachStage.get(t.stage) ?? 0) + 1);
        clockState.set(t.id, { breached: true, underAnHour: false });
      } else if (s.remainingMins < this.sla.thresholds.slaRiskBusinessMins) {
        underAnHour++;
        clockState.set(t.id, { breached: false, underAnHour: true });
      }
    }
    const stageRows = (count: (s: Stage) => number) =>
      (Object.values(Stage) as Stage[])
        .filter((s) => s !== Stage.CLOSED)
        .map((stage) => ({ stage, label: STAGE_META[stage].label, n: count(stage) }));

    const outcomes: Array<{
      insurer_id: string;
      insurer: string;
      approached: number;
      responded: number;
      quoted: number;
      declined: number;
    }> = ids.length
      ? await this.ds.query(
          `SELECT i.id AS insurer_id, i.name AS insurer,
                  count(*)::int AS approached,
                  count(*) FILTER (WHERE th.status <> $2)::int AS responded,
                  count(*) FILTER (WHERE th.status = ANY($3))::int AS quoted,
                  count(*) FILTER (WHERE th.status = $4)::int AS declined
             FROM insurer_threads th JOIN insurers i ON i.id = th.insurer_id
            WHERE th.ticket_id = ANY($1)
            GROUP BY i.id, i.name ORDER BY approached DESC, i.name`,
          [ids, ThreadStatus.RFQ_SENT, QUOTED, ThreadStatus.DECLINED],
        )
      : [];

    // A ticket counts at every step up to the furthest it reached (floating implies the outreach was approved).
    const observed = FUNNEL.filter((f) => f.sql);
    const reached = (i: number) =>
      observed
        .slice(i)
        .map((f) => `(${f.sql})`)
        .join(' OR ');
    const [funnelRow]: Array<Record<string, number>> = await this.ds.query(
      `SELECT ${observed.map((_, i) => `count(*) FILTER (WHERE ${reached(i)})::int AS s${i}`).join(', ')} FROM placement_tickets t WHERE ${scopeSql}`,
    );

    return {
      scope: head ? 'team' : 'visible',
      pipeline: {
        active: active.length,
        closed: closed.length,
        quoteSelected: closed.filter((t) => t.outcomeType === OutcomeType.QUOTE_SELECTED).length,
        lost: closed.filter((t) => t.outcomeType === OutcomeType.LOST).length,
        noAppetite: closed.filter((t) => t.outcomeType === OutcomeType.NO_APPETITE).length,
        byStage: stageRows((s) => active.filter((t) => t.stage === s).length),
      },
      sla: {
        within: active.length - breached,
        breached,
        underAnHour,
        breachesByStage: stageRows((s) => breachStage.get(s) ?? 0).filter((r) => r.n > 0),
      },
      insurerOutcomes: outcomes.map(({ insurer_id, ...r }) => ({ insurerId: insurer_id, ...r })),
      funnel: FUNNEL.map((f) => ({
        step: f.step,
        definition: f.definition,
        n: f.sql ? funnelRow[`s${observed.indexOf(f)}`] : null,
      })),
      team: head ? await this.team(tickets, clockState, now) : null,
    };
  }

  /** PRD 9.2 Placement Head dashboard over every ticket (the Head's scope). */
  private async team(
    tickets: PlacementTicket[],
    clockState: Map<string, { breached: boolean; underAnHour: boolean }>,
    now: Date,
  ): Promise<TeamDashboard> {
    const ids = tickets.map((t) => t.id);
    // when each wait started: the active RFQ's float (quote collection) and the open draft QCR (QCR release)
    const floats: Array<{ ticket_id: string; at: Date }> = ids.length
      ? await this.ds.query(
          `SELECT v.ticket_id, v.floated_at AS at FROM rfq_versions v JOIN placement_tickets t ON t.id = v.ticket_id AND v.version = t.active_rfq_version WHERE v.ticket_id = ANY($1) AND v.floated_at IS NOT NULL`,
          [ids],
        )
      : [];
    const drafts: Array<{ ticket_id: string; at: Date }> = ids.length
      ? await this.ds.query(
          `SELECT ticket_id, max(created_at) AS at FROM qcr_versions WHERE ticket_id = ANY($1) AND status = 'draft' GROUP BY ticket_id`,
          [ids],
        )
      : [];
    const [{ n: reassignments }] = await this.ds.query(
      `SELECT count(*)::int AS n FROM audit_events WHERE event = 'Ticket reassigned' AND at >= $1`,
      [new Date(now.getTime() - 30 * 86_400_000)],
    );
    const floatAt = new Map(floats.map((r) => [r.ticket_id, new Date(r.at)]));
    const draftAt = new Map(drafts.map((r) => [r.ticket_id, new Date(r.at)]));
    const rows: TeamTicket[] = tickets.map((t) => ({
      ticketNo: t.ticketNo,
      stage: t.stage,
      ownerId: t.ownerId,
      ownerName: t.owner?.name ?? '',
      escalated: t.escalated,
      urgency: t.urgency,
      businessType: t.businessType,
      productType: t.productType,
      industryType: t.industryType,
      channel: t.channel,
      outcomeType: t.outcomeType,
      receivedAt: t.receivedAt,
      waitSince:
        t.stage === Stage.AWAITING_RM
          ? t.slaAnchorAt
          : t.stage === Stage.MARKET
            ? (floatAt.get(t.id) ?? null)
            : t.stage === Stage.QCR_DRAFT
              ? (draftAt.get(t.id) ?? null)
              : null,
      breached: clockState.get(t.id)?.breached ?? false,
      underAnHour: clockState.get(t.id)?.underAnHour ?? false,
    }));
    return teamDashboard(rows, {
      now,
      minutesBetween: (a, b) => this.sla.calendar.minutesBetween(a, b),
      minutesPerDay: this.sla.calendar.minutesPerDay,
      reassignmentsLast30Days: reassignments,
    });
  }

  /**
   * Home "Your Progress" (UI-SPEC 3.1) for a range: the Head's Team view is every ticket, Me (and every PM)
   * is the tickets they own; a PM never counts Head-owned escalated tickets (FR-208, FR-209).
   */
  async progress(
    user: AuthUser,
    q: { scope?: string; range?: string; from?: string; to?: string },
  ): Promise<ProgressView> {
    const now = this.clock.now();
    const range = (['week', 'month', 'quarter', 'custom'] as const).find((r) => r === q.range) ?? 'week';
    let from: Date;
    let to: Date;
    if (range === 'custom') {
      from = new Date(q.from ?? '');
      to = new Date(q.to ?? '');
      if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to)
        throw DomainError.guard('Custom range needs a valid from before to');
      if (to > now) to = now;
    } else {
      to = now;
      from = new Date(now.getTime() - RANGE_DAYS[range] * 86_400_000);
    }
    const scope = isHead(user) && q.scope !== 'me' ? 'team' : 'me';
    const where = [
      scope === 'me' ? 't.owner_id = $2' : 'true',
      isHead(user) ? 'true' : 't.escalated = false',
    ].join(' AND ');
    const rows: Array<{
      ticket_id: string;
      sla_id: SlaId;
      kind: 'started' | 'stopped';
      at: Date;
      target: number | null;
    }> = await this.ds.query(
      `SELECT e.ticket_id, e.sla_id, e.kind, e.at, (e.data->>'targetMins')::int AS target
         FROM sla_events e JOIN placement_tickets t ON t.id = e.ticket_id
        WHERE e.thread_id IS NULL AND e.at < $1 AND ${where}`,
      scope === 'me' ? [to, user.id] : [to],
    );
    const events: SlaEventRow[] = rows.map((r) => ({
      ticketId: r.ticket_id,
      slaId: r.sla_id,
      kind: r.kind,
      at: new Date(r.at),
      targetMins: r.target,
    }));
    const ownerType = (id: SlaId) => this.sla.definitions.get(id)?.ownerType;
    const result = computeProgress(events, { from, to }, now, this.sla.calendar, ownerType);
    const slice = (to.getTime() - from.getTime()) / TREND_SLICES;
    const trend = Array.from({ length: TREND_SLICES }, (_, i) => {
      const r = {
        from: new Date(from.getTime() + i * slice),
        to: new Date(from.getTime() + (i + 1) * slice),
      };
      return computeProgress(events, r, now, this.sla.calendar, ownerType).medianSlaUsed;
    });
    return { scope, range, from: from.toISOString(), to: to.toISOString(), ...result, trend };
  }
}
