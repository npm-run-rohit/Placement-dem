import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  BimaSetuInboundType,
  DocumentKind,
  MailDirection,
  PRODUCT_TYPES_SEED,
  type BimaSetuEnvelope,
} from '@bimaplacement/contracts';
import { Clock } from '../../common/time/clock';
import { DomainError } from '../../common/errors/domain-error';
import { Actors } from '../audit/actor';
import { ThreadsService } from '../threads/threads.service';
import { QuotesService } from '../quotes/quotes.service';
import { DocumentsService } from '../documents/documents.service';
import { MailTrailService } from '../communications/mail-trail.service';
import { QcrService } from '../qcr/qcr.service';
import { UsersService } from '../users/users.service';
import { CopycatRunnerHandler } from '../../integrations/copycat/copycat-runner.handler';
import { BimaSetuInboundHandler } from '../../integrations/bimasetu/bimasetu-inbound.handler';
import { BimaSetuMessage } from '../../integrations/bimasetu/bimasetu-message.entity';
import { MAILBOX, type MailboxConnector } from '../../infrastructure/mail/mailbox.port';
import { DevMailboxAdapter } from '../../infrastructure/mail/dev-mailbox.adapter';
import { insurerSubjectRef } from '../communications/template-renderer';
import { floatPreset, type FloatPreset } from './float-presets';

export type InsurerSimKind = 'ack' | 'clarification' | 'decline' | 'quote';

/** DEV FIXTURE wording for simulated insurer replies (not template wording). */
const INSURER_SIM_TEXT: Record<InsurerSimKind, string> = {
  ack: 'Acknowledged, the risk is under review.',
  clarification: 'We need a few clarifications before we can quote.',
  decline: 'Regret, we are unable to quote this risk.',
  quote: 'Please find our quotation attached.',
};

/**
 * The dev simulators' inbound events, shared by the single-event buttons (DevController) and the journey runner
 * (DevJourneyService). Every event goes through the real service / handler, so audit, SLA, outbox and mail happen
 * for real. Only mounted behind FEATURE_DEV_SIMULATORS (the controller guards every route).
 */
@Injectable()
export class DevSimulatorService {
  constructor(
    private readonly clock: Clock,
    private readonly threads: ThreadsService,
    private readonly quotes: QuotesService,
    private readonly documents: DocumentsService,
    private readonly mailTrail: MailTrailService,
    private readonly qcr: QcrService,
    private readonly users: UsersService,
    private readonly copycat: CopycatRunnerHandler,
    private readonly bimasetuInbound: BimaSetuInboundHandler,
    @InjectRepository(BimaSetuMessage) private readonly bimasetuInbox: Repository<BimaSetuMessage>,
    @Inject(MAILBOX) private readonly mailbox: MailboxConnector,
  ) {}

  /** Insurer response on a thread: ack | clarification | decline | quote (prototype "Simulate insurer response"). */
  async insurer(ticketId: string, threadId: string, kind: InsurerSimKind, text?: string) {
    const actor = Actors.insurer('Insurer (simulated)');
    const body = text ?? INSURER_SIM_TEXT[kind];
    if (kind === 'quote') {
      const fileName = `quote-${Date.now()}.pdf`;
      const bytes = Buffer.from('%PDF-1.4 simulated quote');
      const doc = await this.documents.upload({
        ticketId,
        kind: DocumentKind.QUOTE,
        fileName,
        contentType: 'application/pdf',
        buffer: bytes,
        uploadedBy: 'insurer:simulated',
      });
      const quote = await this.quotes.ingestQuote(actor, ticketId, threadId, { documentId: doc.id });
      await this.mailTrail.recordInsurerReply(ticketId, threadId, body, {
        attachmentDocumentIds: [doc.id],
        at: this.clock.now(),
      });
      await this.mirrorInsurerReply(ticketId, threadId, body, [
        { fileName, contentType: 'application/pdf', content: bytes },
      ]);
      return quote;
    }
    const result = await this.threads.applyInsurerEvent(actor, ticketId, threadId, kind, { text: body });
    await this.mailTrail.recordInsurerReply(ticketId, threadId, body, { at: this.clock.now() });
    await this.mirrorInsurerReply(ticketId, threadId, body);
    return result;
  }

  /**
   * DEV ONLY (demo): insurer replies are inbound mail, so they never reach Mailpit on their own. A copy goes there
   * from the thread's first POC to the PM mailbox as `RE: <float subject>`. Only with the dev mailbox adapter.
   */
  private async mirrorInsurerReply(
    ticketId: string,
    threadId: string,
    text: string,
    attachments: Array<{ fileName: string; contentType: string; content: Buffer }> = [],
  ) {
    if (!(this.mailbox instanceof DevMailboxAdapter)) return;
    const m = this.bimasetuInbox.manager;
    const [row] = await m.query(
      `SELECT t.ticket_no, t.business_name, t.product_type, th.thread_ref, th.pocs, u.email AS owner_email, u.mailbox_address
         FROM insurer_threads th JOIN placement_tickets t ON t.id = th.ticket_id
         LEFT JOIN users u ON u.id = t.owner_id
        WHERE th.id = $1 AND th.ticket_id = $2`,
      [threadId, ticketId],
    );
    if (!row) return;
    const [sent] = await m.query(
      `SELECT subject FROM mail_messages WHERE thread_id = $1 AND direction = $2 ORDER BY at ASC LIMIT 1`,
      [threadId, MailDirection.OUTBOUND],
    );
    // the float mail may still be in the outbox: same subject as INS-T01 renders it
    const product = PRODUCT_TYPES_SEED.find((p) => p.code === row.product_type)?.label ?? row.product_type;
    const subject =
      sent?.subject ??
      `${insurerSubjectRef(row.ticket_no, row.thread_ref)} RFQ - ${row.business_name} - ${product}`;
    const pocs = (row.pocs ?? []) as Array<{ email: string }>;
    await this.mailbox.mirrorInbound({
      from: pocs[0]?.email ?? 'insurer@example.test',
      to: [row.mailbox_address ?? row.owner_email ?? 'placement@bimakavach.com'],
      cc: pocs.slice(1).map((p) => p.email),
      subject: `RE: ${subject}`,
      text,
      attachments,
    });
  }

  /** Run the Copycat request now in-process (prototype "Simulate Copycat"); the worker does this from the queue. */
  async runCopycat(requestId: string) {
    // the runner skips stale or unknown requests silently (idempotent); the simulator should say so instead
    if (!(await this.qcr.copycatJob(requestId)))
      throw DomainError.guard(`No Copycat request ${requestId} is waiting to run`);
    await this.copycat.handle('copycat.generate', { requestId });
    return { requestId };
  }

  /** BimaSetu float through the webhook inbox and the real inbound handler. */
  async float(preset: FloatPreset = 'gmc_new') {
    const [rm] = await this.users.rms();
    if (!rm) throw DomainError.guard('No RM in the directory to float from');
    const stamp = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
    const payload = floatPreset(preset, { id: rm.id, name: rm.name, email: rm.email }, stamp);
    const env: BimaSetuEnvelope = {
      messageId: `dev-float-${stamp}`,
      type: BimaSetuInboundType.FLOAT,
      occurredAt: this.clock.now().toISOString(),
      lineRef: payload.lineRef,
      payload,
    };
    const done = await this.deliver(env);
    const [{ ticket_no: ticketNo }] = await this.bimasetuInbox.manager.query(
      `SELECT ticket_no FROM placement_tickets WHERE id = $1`,
      [done.ticketId],
    );
    return { ticketId: done.ticketId as string, ticketNo: ticketNo as string, lineRef: env.lineRef };
  }

  /** client_confirmation / line_lost / query_answer from BimaSetu, through the inbox and the real handler. */
  async bimasetuMessage(ticketId: string, type: string, payload: Record<string, unknown>) {
    const allowed = [
      BimaSetuInboundType.CLIENT_CONFIRMATION,
      BimaSetuInboundType.LINE_LOST,
      BimaSetuInboundType.QUERY_ANSWER,
    ] as string[];
    if (!allowed.includes(type)) throw DomainError.guard(`Simulate one of: ${allowed.join(', ')}`);
    const [t] = await this.bimasetuInbox.manager.query(
      `SELECT bimasetu_line_ref AS "lineRef" FROM placement_tickets WHERE id = $1`,
      [ticketId],
    );
    if (!t?.lineRef) throw DomainError.guard('Only tickets floated from BimaSetu receive BimaSetu messages');
    const stamp = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
    const done = await this.deliver({
      messageId: `dev-${type}-${stamp}`,
      type: type as BimaSetuInboundType,
      occurredAt: this.clock.now().toISOString(),
      lineRef: t.lineRef,
      payload,
    });
    return { status: done.status, ticketId: done.ticketId };
  }

  /** Stores an inbound message in the webhook inbox and runs the real handler; refusals answer 422. */
  private async deliver(env: BimaSetuEnvelope) {
    const row = await this.bimasetuInbox.save(
      this.bimasetuInbox.create({
        direction: 'in',
        messageId: env.messageId,
        type: env.type,
        lineRef: env.lineRef,
        payload: env as never,
      }),
    );
    await this.bimasetuInbound.handle(env.type, { inboxId: row.id });
    const done = await this.bimasetuInbox.findOneByOrFail({ id: row.id });
    if (done.status !== 'processed')
      throw DomainError.guard(done.lastError ?? `${env.type} was not processed`);
    return done;
  }
}
