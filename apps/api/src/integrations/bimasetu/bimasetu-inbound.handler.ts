import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  BimaSetuInboundType,
  RevisionBy,
  type BimaSetuEnvelope,
  type ClientConfirmationPayload,
  type FloatPayload,
  type LineLostPayload,
  type QueryAnswerPayload,
  type RevisionAsk,
  type RevisionRequestPayload,
} from '@bimaplacement/contracts';
import { QueueHandler } from '../../infrastructure/messaging/queue-handler.decorator';
import { QUEUES } from '../../infrastructure/messaging/queues';
import type { JobHandler } from '../../infrastructure/messaging/messaging.ports';
import { BimaSetuMessage } from './bimasetu-message.entity';
import { BimaSetuFloatService } from './bimasetu-float.service';
import { DomainError, type DomainErrorCode } from '../../common/errors/domain-error';
import { Actors } from '../../modules/audit/actor';
import { RfqService } from '../../modules/rfq/rfq.service';
import { ThreadsService } from '../../modules/threads/threads.service';
import { DecisionsService } from '../../modules/decisions/decisions.service';

/**
 * Processes one inbox row exactly once (FR-291). Dispatch:
 *  float               -> BimaSetuFloatService (ticket, or float_rejected) (FR-281/282)
 *  query_answer        -> RfqService.recordRmAnswer (Q-nn) | ThreadsService.recordRmThreadAnswer (IR-nn) (FR-284)
 *  revision_request    -> DecisionsService.onRevisionRequest (FR-287)
 *  client_confirmation -> DecisionsService.selectQuote(source='bimasetu') (FR-288)
 *  line_lost           -> DecisionsService.markLost(source='bimasetu') (FR-288)
 * Built to the draft contract in @bimaplacement/contracts (bimasetu.ts); the wire format is still to be agreed
 * with the BimaSetu team. A business refusal (unknown line, wrong stage, row not in the latest released QCR) is
 * final ('rejected'); anything else, including a line whose float is still being processed or a lock conflict, is
 * 'failed' and retried by the queue. Telling BimaSetu about a rejection needs the outbound contract (PLAN 2.12).
 */
const FINAL_CODES = new Set<DomainErrorCode>([
  'NOT_FOUND',
  'VALIDATION_FAILED',
  'GUARD_FAILED',
  'TRANSITION_NOT_ALLOWED',
  'TERMINAL_TICKET',
  'FORBIDDEN',
]);

@Injectable()
@QueueHandler(QUEUES.BIMASETU_INBOUND, { concurrency: 2 })
export class BimaSetuInboundHandler implements JobHandler {
  private readonly logger = new Logger(BimaSetuInboundHandler.name);

  constructor(
    @InjectRepository(BimaSetuMessage) private readonly inbox: Repository<BimaSetuMessage>,
    private readonly floats: BimaSetuFloatService,
    private readonly rfq: RfqService,
    private readonly threads: ThreadsService,
    private readonly decisions: DecisionsService,
  ) {}

  async handle(_jobName: string, data: { inboxId: string }): Promise<void> {
    const msg = await this.inbox.findOneBy({ id: data.inboxId });
    if (!msg || msg.status === 'processed' || msg.status === 'rejected') return; // exactly once (FR-291)
    const env = msg.payload as unknown as BimaSetuEnvelope;
    try {
      const ticketId = await this.process(env, msg.id);
      await this.inbox.update(msg.id, {
        status: 'processed',
        ticketId,
        processedAt: new Date(),
        attempts: msg.attempts + 1,
      });
    } catch (e) {
      const rejected = e instanceof DomainError && FINAL_CODES.has(e.code);
      await this.inbox.update(msg.id, {
        status: rejected ? 'rejected' : 'failed',
        lastError: (e as Error).message,
        attempts: msg.attempts + 1,
      });
      if (!rejected) throw e;
      this.logger.warn(`BimaSetu ${env.type} ${env.messageId} rejected: ${(e as Error).message}`);
    }
  }

  private async process(env: BimaSetuEnvelope, inboxId: string): Promise<string | null> {
    if (env.type === BimaSetuInboundType.FLOAT)
      return (await this.floats.receive(env.payload as FloatPayload, inboxId)).ticketId;
    const ticketId = await this.ticketFor(env.lineRef);
    const actor = Actors.bimasetu();
    switch (env.type as BimaSetuInboundType) {
      case BimaSetuInboundType.QUERY_ANSWER: {
        const p = env.payload as QueryAnswerPayload;
        if (/^IR-\d+$/.test(p.queryRef)) {
          const [clar] = await this.inbox.manager.query(
            `SELECT th.thread_ref FROM thread_clarifications c JOIN insurer_threads th ON th.id = c.thread_id
              WHERE th.ticket_id = $1 AND c.rm_query_ref = $2 LIMIT 1`,
            [ticketId, p.queryRef],
          );
          if (!clar) throw DomainError.notFound('Information request', p.queryRef);
          await this.threads.recordRmThreadAnswer(
            Actors.bimasetu(p.answeredBy?.name),
            ticketId,
            clar.thread_ref,
            p.answer,
            p.queryRef,
          );
        } else {
          await this.rfq.recordRmAnswer(Actors.bimasetu(p.answeredBy?.name), ticketId, {
            queryRef: p.queryRef,
            text: p.answer,
            answeredBy: p.answeredBy?.name ?? 'RM',
          });
        }
        return ticketId;
      }
      case BimaSetuInboundType.REVISION_REQUEST: {
        const p = env.payload as RevisionRequestPayload;
        await this.decisions.onRevisionRequest(actor, ticketId, {
          by: p.by === 'us' ? RevisionBy.US : RevisionBy.CLIENT,
          reason: p.reason,
          asks: (p.asks ?? []) as RevisionAsk[],
          messageId: env.messageId,
        });
        return ticketId;
      }
      case BimaSetuInboundType.CLIENT_CONFIRMATION: {
        const p = env.payload as ClientConfirmationPayload;
        await this.decisions.selectQuote(actor, ticketId, p.quoteRowId, 'bimasetu', p.qcrRound);
        return ticketId;
      }
      case BimaSetuInboundType.LINE_LOST: {
        const p = env.payload as LineLostPayload;
        await this.decisions.markLost(
          actor,
          ticketId,
          p.reason?.trim() || 'Line lost in BimaSetu',
          'bimasetu',
        );
        return ticketId;
      }
      default:
        throw DomainError.guard(`Unsupported BimaSetu message type "${env.type}"`);
    }
  }

  private async ticketFor(lineRef: string): Promise<string> {
    const [t] = await this.inbox.manager.query(
      `SELECT id FROM placement_tickets WHERE bimasetu_line_ref = $1`,
      [lineRef],
    );
    if (t) return t.id;
    // The float for this line is in the inbox but not processed yet (e.g. retrying): retry this message too.
    const [pendingFloat] = await this.inbox.manager.query(
      `SELECT 1 FROM bimasetu_messages
        WHERE direction = 'in' AND type = $1 AND line_ref = $2 AND status IN ('pending', 'failed') LIMIT 1`,
      [BimaSetuInboundType.FLOAT, lineRef],
    );
    if (pendingFloat) throw new Error(`Float for BimaSetu line ${lineRef} is not processed yet`);
    throw DomainError.notFound('Ticket for BimaSetu line', lineRef);
  }
}
