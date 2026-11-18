import { Body, Controller, ForbiddenException, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import { RevisionAsk, RevisionBy } from '@bimaplacement/contracts';
import type { AppConfig } from '../../config/configuration';
import { Clock } from '../../common/time/clock';
import { DomainError } from '../../common/errors/domain-error';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthUser } from '../../common/auth/auth.types';
import { Actors } from '../audit/actor';
import { RfqService } from '../rfq/rfq.service';
import { ThreadsService } from '../threads/threads.service';
import { SlaConfigService } from '../sla/sla-config.service';
import { SlaSweeperHandler } from '../automation/sla-sweeper.handler';
import { InboundMailService } from '../inbound-mail/inbound-mail.service';
import { DecisionsService } from '../decisions/decisions.service';
import { DevSimulatorService, type InsurerSimKind } from './dev-simulator.service';
import { DevJourneyService, type JourneyUntil } from './dev-journey.service';
import type { FloatPreset } from './float-presets';
/**
 * Replaces the prototype's amber "Simulate ..." blocks and the engine-time chip with real
 * inbound events, behind FEATURE_DEV_SIMULATORS (never enabled in staging/prod).
 *  - GET  /dev/clock                                -> engine time (PlEngineChip)
 *  - POST /dev/clock/advance        {minutes} | {businessMinutes} -> move engine time, then run the SLA sweep
 *  - POST /dev/clock/reset                          -> back to real time
 *  - POST /dev/mail/inbound          InboundMailRaw  -> as if the insurer/RM replied
 *  - POST /dev/tickets/:id/revision  {by, reason, asks} -> as if BimaSetu sent a revision_request
 *  - POST /dev/tickets/:id/simulate/next | run, /dev/simulate/journey -> journey simulator (demo)
 */
@ApiTags('dev')
@Controller('dev')
export class DevController {
  constructor(
    private readonly config: ConfigService<AppConfig, true>,
    private readonly clock: Clock,
    private readonly rfq: RfqService,
    private readonly threads: ThreadsService,
    private readonly sla: SlaConfigService,
    private readonly sweeper: SlaSweeperHandler,
    private readonly inboundMail: InboundMailService,
    private readonly decisions: DecisionsService,
    private readonly sim: DevSimulatorService,
    private readonly journey: DevJourneyService,
  ) {}

  private guard() {
    if (
      !this.config.get('features', { infer: true }).devSimulators ||
      this.config.get('env', { infer: true }) === 'production'
    ) {
      throw new ForbiddenException('Dev simulators are disabled');
    }
  }

  @Get('clock')
  engineTime() {
    this.guard();
    return this.engine();
  }

  /** Wall-clock `minutes`, or `businessMinutes` on the business calendar (prototype: +30 min / +1 BH / +1 BD / +3 BD / +1 WD). Runs the SLA sweep in-process so follow-ups and SLA-P1 fire at the new time. */
  @Post('clock/advance')
  async advance(@Body() body: { minutes?: number; businessMinutes?: number }) {
    this.guard();
    const now = this.clock.now();
    const target = body.businessMinutes
      ? this.sla.calendar.addMinutes(now, Number(body.businessMinutes))
      : new Date(now.getTime() + Number(body.minutes ?? 0) * 60_000);
    this.clock.advance(target.getTime() - now.getTime());
    await this.sweeper.handle();
    return this.engine();
  }

  @Post('clock/reset')
  reset() {
    this.guard();
    this.clock.advance(Date.now() - this.clock.now().getTime());
    return this.engine();
  }

  private engine() {
    const now = this.clock.now();
    return { now: now.toISOString(), offsetMins: Math.round((now.getTime() - Date.now()) / 60_000) };
  }

  /**
   * Inbound mail as if it arrived in a PM mailbox: runs the real M7 pipeline (map, classify, auto-apply or
   * route to Manual Review). attachmentName adds a small placeholder file.
   */
  @Post('mail/inbound')
  async inbound(
    @Body()
    raw: {
      from: string;
      subject: string;
      textBody: string;
      mailbox?: string;
      inReplyTo?: string;
      attachmentName?: string;
    },
  ) {
    this.guard();
    const now = this.clock.now();
    const mail = await this.inboundMail.ingest({
      providerMessageId: `dev-in-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}@insurer.example.test`,
      mailbox: raw.mailbox ?? 'placement@bimakavach.com',
      from: raw.from,
      to: [raw.mailbox ?? 'placement@bimakavach.com'],
      cc: [],
      subject: raw.subject,
      textBody: raw.textBody,
      receivedAt: now,
      inReplyTo: raw.inReplyTo ?? null,
      attachments: raw.attachmentName
        ? [
            {
              fileName: raw.attachmentName,
              contentType: /\.pdf$/i.test(raw.attachmentName)
                ? 'application/pdf'
                : 'application/octet-stream',
              size: 32,
              fetch: async () => Buffer.from(`%PDF-1.4 dev inbound ${raw.attachmentName}`),
            },
          ]
        : [],
    });
    return mail
      ? {
          id: mail.id,
          queue: mail.reviewQueue,
          reason: mail.reviewReason,
          classification: mail.classification,
          applied: mail.appliedClass,
        }
      : { duplicate: true };
  }

  /** RM answered (manual ticket mail / BimaSetu query_answer). */
  @Post('tickets/:id/rm-reply')
  rmReply(@Param('id', ParseUUIDPipe) id: string, @Body() body: { text: string; queryRef?: string }) {
    this.guard();
    return this.rfq.recordRmAnswer(Actors.rm('RM (simulated)'), id, {
      text: body.text,
      queryRef: body.queryRef,
      answeredBy: 'RM (simulated)',
    });
  }

  /** Run the Copycat request now in-process (prototype "Simulate Copycat"); the worker does this from the queue. */
  @Post('copycat/:requestId/run')
  runCopycat(@Param('requestId') requestId: string) {
    this.guard();
    return this.sim.runCopycat(requestId);
  }

  /** RM answered a thread's information request (prototype "Simulate RM response" on a held thread). */
  @Post('tickets/:id/threads/:threadId/rm-reply')
  async threadRmReply(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('threadId', ParseUUIDPipe) threadId: string,
    @Body() body: { text: string },
  ) {
    this.guard();
    const thread = (await this.threads.list(id)).find((t) => t.id === threadId);
    if (!thread) throw DomainError.notFound('Thread', threadId);
    return this.threads.recordRmThreadAnswer(Actors.rm('RM (simulated)'), id, thread.threadRef, body.text);
  }

  /** Insurer response on a thread: ack | clarification | decline | quote (prototype "Simulate insurer response"). */
  @Post('tickets/:id/threads/:threadId/insurer')
  insurer(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('threadId', ParseUUIDPipe) threadId: string,
    @Body() body: { kind: InsurerSimKind; text?: string },
  ) {
    this.guard();
    if (!['ack', 'clarification', 'decline', 'quote'].includes(body.kind))
      throw DomainError.guard('kind must be one of ack, clarification, decline, quote');
    return this.sim.insurer(id, threadId, body.kind, body.text);
  }

  /** BimaSetu revision_request on a released QCR (prototype "Simulate BimaSetu" round modal; inbound webhook in prod, FR-287). */
  @Post('tickets/:id/revision')
  revision(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { by?: RevisionBy; reason?: string; asks?: RevisionAsk[] },
  ) {
    this.guard();
    return this.decisions.onRevisionRequest(Actors.bimasetu('RM (simulated)'), id, {
      by: body.by ?? RevisionBy.CLIENT,
      reason: body.reason ?? 'Client wants better terms',
      asks: body.asks?.length ? body.asks : [RevisionAsk.RERATE],
      messageId: `dev-revision-${Date.now()}`,
    });
  }

  /**
   * BimaSetu float (prototype "Simulate BimaSetu float"): stores the message in the webhook inbox exactly as
   * the webhook does, then runs the real inbound handler on it. A rejected float answers 422 with the reason.
   */
  @Post('bimasetu/float')
  float(@Body() body: { preset?: FloatPreset }) {
    this.guard();
    return this.sim.float(body.preset ?? 'gmc_new');
  }

  /**
   * BimaSetu after the QCR (prototype "Simulate BimaSetu"): client_confirmation { quoteRowId }, line_lost { reason },
   * query_answer { queryRef, answer }. Delivered through the inbox and the real handler, as the webhook would.
   */
  @Post('tickets/:id/bimasetu/:type')
  bimasetuMessage(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('type') type: string,
    @Body() payload: Record<string, unknown>,
  ) {
    this.guard();
    return this.sim.bimasetuMessage(id, type, payload);
  }

  /** Journey simulator (demo): ONE next step from the ticket's current state, through the real services. */
  @Post('tickets/:id/simulate/next')
  simulateNext(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    this.guard();
    return this.journey.next(user, id);
  }

  /** Next steps until the stage is reached (default qcr_released) or the ticket closes; at most 40 steps. */
  @Post('tickets/:id/simulate/run')
  simulateRun(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { until?: JourneyUntil },
  ) {
    this.guard();
    return this.journey.run(user, id, untilOf(body?.until));
  }

  /** A fresh ticket (manual by default, so the QCR-to-RM mail shows in Mailpit) run to `until`. */
  @Post('simulate/journey')
  simulateJourney(
    @CurrentUser() user: AuthUser,
    @Body() body: { channel?: 'manual' | 'bimasetu'; until?: JourneyUntil },
  ) {
    this.guard();
    const channel = body?.channel ?? 'manual';
    if (channel !== 'manual' && channel !== 'bimasetu')
      throw DomainError.guard('channel must be manual or bimasetu');
    return this.journey.journey(user, channel, untilOf(body?.until));
  }
}

function untilOf(until: unknown): JourneyUntil {
  if (until === undefined || until === null || until === '') return 'qcr_released';
  if (until !== 'qcr_released' && until !== 'closed')
    throw DomainError.guard('until must be qcr_released or closed');
  return until;
}
