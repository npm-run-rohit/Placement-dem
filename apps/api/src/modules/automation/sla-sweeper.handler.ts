import { Injectable, Logger } from '@nestjs/common';
import { DataSource, LessThanOrEqual, Not } from 'typeorm';
import { SlaOwnerType, Stage } from '@bimaplacement/contracts';
import { QueueHandler } from '../../infrastructure/messaging/queue-handler.decorator';
import { QUEUES } from '../../infrastructure/messaging/queues';
import { recordHeartbeat } from '../../infrastructure/metrics/heartbeat';
import type { JobHandler } from '../../infrastructure/messaging/messaging.ports';
import { Clock } from '../../common/time/clock';
import { SlaConfigService } from '../sla/sla-config.service';
import { PlacementTicket } from '../tickets/entities/placement-ticket.entity';
import { TicketWorkflow } from '../tickets/ticket-workflow.service';
import { Actors } from '../audit/actor';
import { UsersService } from '../users/users.service';
import { InsurerThread } from '../threads/entities/insurer-thread.entity';
import { ThreadEvent } from '../threads/entities/thread-event.entity';
import { dueFollowUpStep, FOLLOW_UP_STATUSES } from './follow-up-ladder';

/**
 * Runs every minute (WorkerBootstrap). Idempotent - safe to run concurrently with row locks.
 *  1) Insurer follow-up ladder per thread: FU1/FU2/Escalation at 1/2/3 business days after float,
 *     only for follow-up-eligible threads and when the ticket has not hit the threshold (BR-037..043).
 *     Reminders due outside business hours wait for the next window (M6 validation).
 *  2) SLA-P1 internal escalation: reminder at breach + 2 x 30 BM, then owner -> Placement Head
 *     (FR-225, FR-207). Cancels when the PM acts (clock changes); re-arms on the next internal breach.
 *  Mirrors prototype plSweepClockEvents().
 */
@Injectable()
@QueueHandler(QUEUES.SLA_SWEEP)
export class SlaSweeperHandler implements JobHandler {
  private readonly logger = new Logger(SlaSweeperHandler.name);
  /** Items this run could not process; written with the heartbeat (PLAN 4.6). */
  private errors = 0;

  constructor(
    private readonly ds: DataSource,
    private readonly sla: SlaConfigService,
    private readonly clock: Clock,
    private readonly workflow: TicketWorkflow,
    private readonly users: UsersService,
  ) {}

  async handle(): Promise<void> {
    const now = this.clock.now();
    this.errors = 0;
    await this.followUps(now);
    await this.internalEscalations(now);
    await recordHeartbeat(this.ds, 'sla-sweep', this.errors);
  }

  /**
   * Insurer follow-up ladder (BR-037..043, FR-065): for open threads still waiting on the insurer, send the
   * due step to all POCs from the PM's mailbox (INS-T02 / T03 / T04). Held time is excluded (BR-040), and
   * nothing goes out after the ticket's threshold auto-stop (BR-041) or outside business hours.
   */
  private async followUps(now: Date) {
    if (this.sla.calendar.nextBusinessMoment(now).getTime() > now.getTime()) return; // wait for the next business window
    const candidates: Array<{ id: string; ticket_id: string }> = await this.ds.query(
      `SELECT th.id, th.ticket_id FROM insurer_threads th JOIN placement_tickets t ON t.id = th.ticket_id
        WHERE th.follow_ups_active AND th.status = ANY($1) AND th.paused_since IS NULL AND th.floated_at IS NOT NULL
          AND th.follow_ups_sent < $2 AND th.rfq_version = t.active_rfq_version
          AND NOT t.follow_ups_stopped AND t.stage <> $3
        LIMIT 500`,
      [FOLLOW_UP_STATUSES, this.sla.followUpLadder.length, Stage.CLOSED],
    );
    for (const c of candidates) {
      try {
        await this.workflow.run(c.ticket_id, Actors.system('Follow-up ladder'), async (ctx) => {
          const th = await ctx.manager.getRepository(InsurerThread).findOneByOrFail({ id: c.id });
          // re-check under the ticket lock: a reply or decision may have landed since the select
          if (
            !th.followUpsActive ||
            !FOLLOW_UP_STATUSES.includes(th.status) ||
            th.pausedSince ||
            !th.floatedAt ||
            ctx.ticket.followUpsStopped
          )
            return;
          const active = this.sla.calendar.minutesBetween(th.floatedAt, ctx.now) - th.heldMins;
          const step = dueFollowUpStep(
            active,
            th.followUpsSent,
            this.sla.followUpLadder,
            this.sla.calendar.minutesPerDay,
          );
          if (step === null) return;
          const rung = this.sla.followUpLadder.find((s) => s.step === step)!;
          const skipped = step - th.followUpsSent - 1;
          th.followUpsSent = step;
          th.lastEventAt = ctx.now;
          await ctx.manager.getRepository(InsurerThread).save(th);
          await ctx.manager.getRepository(ThreadEvent).insert({
            at: ctx.now,
            threadId: th.id,
            kind: 'follow_up',
            actorType: ctx.actor.type,
            actorId: ctx.actor.id,
            text: `${rung.label} sent automatically (${rung.templateId})`,
          });
          await ctx.outbox({
            destination: 'mail',
            eventType: 'mail.insurer_follow_up',
            payload: {
              templateId: rung.templateId,
              ticketId: ctx.ticket.id,
              threadId: th.id,
              fromUserId: ctx.ticket.ownerId,
              step,
            },
          });
          if (step === this.sla.followUpLadder.length) {
            // insurer escalation threshold: tell the PM (PRD: PM + configured escalation owner, INT-T02)
            const previous = this.sla.followUpLadder.find((s) => s.step === step - 1);
            await ctx.outbox({
              destination: 'notification',
              eventType: 'thread.follow_up_escalation',
              payload: {
                ticketId: ctx.ticket.id,
                ownerId: ctx.ticket.ownerId,
                threadId: th.id,
                slaStage: `${rung.label} (${rung.afterBusinessDays} business days)`,
                lastAction: previous ? `${previous.label} sent` : 'RFQ sent',
              },
            });
          }
          await ctx.audit(
            `${rung.label} sent`,
            `${th.threadRef} · ${rung.templateId}${skipped > 0 ? ` · ${skipped} earlier step(s) skipped while the worker was down` : ''}`,
          );
        });
      } catch (e) {
        this.errors += 1;
        this.logger.warn(`Follow-up on thread ${c.id} failed: ${(e as Error).message}`);
      }
    }
  }

  private async internalEscalations(now: Date) {
    const breached = await this.ds.getRepository(PlacementTicket).find({
      where: {
        slaOwnerType: SlaOwnerType.INTERNAL,
        slaDueAt: LessThanOrEqual(now),
        stage: Not(Stage.CLOSED),
        escalated: false,
      },
      take: 200,
    });
    const [head] = breached.length ? await this.users.heads() : [];
    for (const t of breached) {
      try {
        await this.workflow.run(t.id, Actors.system('SLA engine'), async (ctx) => {
          const tk = ctx.ticket;
          if (!tk.slaDueAt || tk.slaOwnerType !== SlaOwnerType.INTERNAL || tk.escalated) return;
          // already escalated for this breach and handed back by the Head (BR-113): wait for the next clock (FR-225)
          if (tk.p1EscalatedAt) return;
          const interval = this.sla.slaP1.reminderIntervalMins;
          const elapsedSinceBreach = this.sla.calendar.minutesBetween(tk.slaDueAt, ctx.now);
          const dueReminders = Math.min(
            this.sla.slaP1.remindersBeforeEscalation,
            1 + Math.floor(elapsedSinceBreach / interval),
          );
          if (!tk.p1ArmedAt) tk.p1ArmedAt = tk.slaDueAt;
          while (tk.p1RemindersSent < dueReminders) {
            tk.p1RemindersSent += 1;
            await ctx.audit(`SLA-P1 reminder ${tk.p1RemindersSent} sent`, `${tk.slaId} breached`);
            await ctx.outbox({
              destination: 'notification',
              eventType: 'sla.p1_reminder',
              payload: { ticketId: tk.id, ownerId: tk.ownerId, templateId: 'INT-T02', n: tk.p1RemindersSent },
            });
          }
          if (elapsedSinceBreach >= interval * this.sla.slaP1.remindersBeforeEscalation) {
            // FR-207: ownership moves to the Placement Head; both owners are notified (INT-T06)
            const previousOwnerId = tk.ownerId;
            tk.escalated = true;
            tk.p1EscalatedAt = ctx.now;
            if (head) tk.ownerId = head.id;
            await ctx.audit(
              'Escalated to Placement Head',
              `SLA-P1 ladder exhausted${head ? ` · owner ${head.name}` : ' · no active Placement Head, owner unchanged'}`,
              { before: previousOwnerId, after: tk.ownerId },
            );
            await ctx.outbox({
              destination: 'notification',
              eventType: 'sla.p1_escalated',
              payload: { ticketId: tk.id, templateId: 'INT-T06', previousOwnerId, ownerId: tk.ownerId },
            });
          }
        });
      } catch (e) {
        this.errors += 1;
        this.logger.warn(`SLA-P1 on ${t.ticketNo} failed: ${(e as Error).message}`);
      }
    }
  }
}
