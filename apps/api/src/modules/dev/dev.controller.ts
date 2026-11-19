import { Body, Controller, ForbiddenException, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags } from '@nestjs/swagger';
import { DataSource } from 'typeorm';
import type { Request } from 'express';
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
import { randomUUID } from 'node:crypto';
import { signEmailLayer, type DeliveryPayload } from '../../integrations/email-layer/contract';
import { EmailLayerWebhookController } from '../../integrations/email-layer/email-layer-webhook.controller';
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
 *  - POST /dev/tickets/:id/email-layer/deliver {threadId, kind} -> a signed email layer delivery through the real webhook handler
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
    private readonly emailLayer: EmailLayerWebhookController,
    private readonly ds: DataSource,
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

  /**
   * Shared email layer (dev): builds a delivery for a thread, signs it with EMAIL_LAYER_SECRET and hands it to the
   * webhook controller's own handler (signature check, shape check, dedupe, inbound routing), so nothing is
   * bypassed. kind: insurer (first POC, in the thread's conversation) | colleague (a placement colleague's own
   * Gmail reply, sentByStaff) | unanchored (first POC, no conversation, subject carries the tag; BR-046).
   * Dev data: addresses come from the thread's POCs and the users table; wording is a dev fixture.
   */
  @Post('tickets/:id/email-layer/deliver')
  async emailLayerDeliver(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { threadId: string; kind: 'insurer' | 'colleague' | 'unanchored' },
  ) {
    this.guard();
    if (!['insurer', 'colleague', 'unanchored'].includes(body?.kind))
      throw DomainError.guard('kind must be one of insurer, colleague, unanchored');
    const [row] = await this.ds.query(
      `SELECT t.ticket_no, th.thread_ref, th.pocs, u.email AS owner_email, u.mailbox_address
         FROM insurer_threads th JOIN placement_tickets t ON t.id = th.ticket_id
         LEFT JOIN users u ON u.id = t.owner_id
        WHERE th.id = $1 AND th.ticket_id = $2`,
      [body.threadId, id],
    );
    if (!row) throw DomainError.notFound('Thread', String(body.threadId));
    const pocs = (row.pocs ?? []) as Array<{ email: string }>;
    const mailbox: string = row.mailbox_address ?? row.owner_email ?? 'placement@bimakavach.com';
    let from = pocs[0]?.email ?? 'insurer@example.test';
    if (body.kind === 'colleague') {
      // another placement user when there is one, otherwise the owner (the owner's own Gmail reply counts too)
      const [other] = await this.ds.query(
        `SELECT email FROM users WHERE roles && ARRAY['placement_manager','placement_head']::text[] AND lower(email) <> lower($1) ORDER BY email LIMIT 1`,
        [row.owner_email ?? ''],
      );
      from = other?.email ?? row.owner_email ?? 'placement@bimakavach.com';
    }
    const now = this.clock.now();
    const tag = `${row.ticket_no} | ${row.thread_ref}`;
    const n = `${now.getTime()}-${randomUUID().slice(0, 8)}`;
    const payload: DeliveryPayload = {
      deliveryId: `dev-el-${n}`,
      product: 'placement',
      conversationRef: body.kind === 'unanchored' ? null : `${row.ticket_no}/${row.thread_ref}`,
      rootMessageId: `<dev-el-root-${n}@email-layer.example.test>`,
      message: {
        rfcMessageId: `<dev-el-${n}@email-layer.example.test>`,
        inReplyTo: null,
        references: [],
        from,
        to: body.kind === 'colleague' ? pocs.map((p) => p.email) : [mailbox],
        cc: [],
        subject:
          body.kind === 'unanchored'
            ? `Fwd: [${tag}] RFQ`
            : body.kind === 'colleague'
              ? `Re: [${tag}] RFQ`
              : `RE: [${tag}] RFQ`,
        textBody:
          body.kind === 'colleague'
            ? 'Shared the claims history with the insurer from my Gmail (simulated).'
            : 'Noted. We will revert on this shortly (simulated).',
        htmlBody: null,
        sentAt: now.toISOString(),
        seenInMailboxes: [body.kind === 'colleague' ? from : mailbox],
        sentByStaff: body.kind === 'colleague',
        attachments: [],
      },
    };
    const raw = JSON.stringify(payload);
    const cfg = this.config.get('mailbox', { infer: true }).emailLayer;
    const outcome = await this.emailLayer.receive(
      { rawBody: Buffer.from(raw, 'utf8'), ip: 'dev-simulator' } as unknown as Request & { rawBody?: Buffer },
      signEmailLayer(raw, cfg.secret),
      payload,
    );
    return { ...outcome, deliveryId: payload.deliveryId, rfcMessageId: payload.message.rfcMessageId };
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
