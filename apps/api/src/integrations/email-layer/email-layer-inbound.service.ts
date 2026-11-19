import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { DomainError } from '../../common/errors/domain-error';
import type { InboundMailRaw } from '../../infrastructure/mail/mailbox.port';
import { InboundMailService } from '../../modules/inbound-mail/inbound-mail.service';
import { PlacementTicket } from '../../modules/tickets/entities/placement-ticket.entity';
import type { DeliveryPayload } from './contract';
import { EmailLayerDelivery } from './email-layer-delivery.entity';

const PRODUCT = 'placement';
const REF_TICKET = /^(PLC-\d{4,})(?:\/|$)/;

/** The message cannot be taken right now (attachment URL, database); the layer retries with fresh URLs. */
export class EmailLayerUnavailableError extends Error {}

/** The attachment URL did not deliver the file (expired, layer down): transient. */
class AttachmentFetchError extends Error {}

/** Connection loss, serialization failure, resource limits: Postgres classes 08, 40, 53, 57. */
function isTransientDbError(e: unknown): boolean {
  const code =
    e instanceof QueryFailedError ? (e.driverError as { code?: string } | undefined)?.code : undefined;
  return !!code && /^(08|40|53|57)/.test(code);
}

/** Minimum shape before a delivery is touched; returns the problem or null. */
export function deliveryProblem(p: Partial<DeliveryPayload> | undefined): string | null {
  const str = (v: unknown) => typeof v === 'string' && v.length > 0;
  if (!p || typeof p !== 'object') return 'Body must be a delivery';
  if (!str(p.deliveryId) || p.deliveryId!.length > 200) return 'deliveryId is required (max 200 characters)';
  if (!str(p.product)) return 'product is required';
  if (p.conversationRef !== null && typeof p.conversationRef !== 'string')
    return 'conversationRef must be a string or null';
  const m = p.message;
  if (!m || typeof m !== 'object') return 'message is required';
  if (!str(m.rfcMessageId) || !str(m.from)) return 'message.rfcMessageId and message.from are required';
  const lists = [m.to, m.cc, m.references, m.seenInMailboxes, m.attachments];
  if (lists.some((l) => !Array.isArray(l)))
    return 'message lists (to, cc, references, seenInMailboxes, attachments) must be arrays';
  if (!m.seenInMailboxes.length) return 'message.seenInMailboxes must name a mailbox';
  if (Number.isNaN(new Date(m.sentAt).getTime())) return 'message.sentAt must be a date';
  if (m.attachments.some((a) => !str(a?.url) || !str(a?.fileName)))
    return 'every attachment needs fileName and url';
  return null;
}

/**
 * Shared email layer -> Placement: one signed delivery per message in a Placement conversation. Dedupe on
 * deliveryId; attachments are fetched BEFORE anything is stored, so an expired URL answers 503 (the layer
 * retries with fresh URLs) and never leaves a mail without its attachment. Routing rules live in InboundMailService.
 */
@Injectable()
export class EmailLayerInboundService {
  private readonly logger = new Logger(EmailLayerInboundService.name);

  constructor(
    @InjectRepository(EmailLayerDelivery) private readonly deliveries: Repository<EmailLayerDelivery>,
    @InjectRepository(PlacementTicket) private readonly tickets: Repository<PlacementTicket>,
    private readonly inbound: InboundMailService,
  ) {}

  async receive(payload: DeliveryPayload): Promise<'processed' | 'duplicate' | 'rejected'> {
    const prior = await this.deliveries.findOne({ where: { deliveryId: payload.deliveryId } });
    if (prior?.status === 'processed') return 'duplicate';

    const rejection = await this.rejection(payload);
    if (rejection) {
      await this.record(payload, 'rejected', rejection, prior);
      return 'rejected';
    }

    try {
      const m = payload.message;
      const attachments: InboundMailRaw['attachments'] = [];
      for (const a of m.attachments) {
        const buffer = await fetchFile(a.url);
        attachments.push({
          fileName: a.fileName,
          contentType: a.contentType,
          size: a.size,
          fetch: async () => buffer,
        });
      }
      await this.inbound.ingest({
        providerMessageId: m.rfcMessageId,
        providerThreadId: payload.rootMessageId,
        mailbox: m.seenInMailboxes[0],
        from: m.from,
        to: m.to,
        cc: m.cc,
        subject: m.subject,
        textBody: m.textBody,
        htmlBody: m.htmlBody,
        receivedAt: new Date(m.sentAt),
        inReplyTo: m.inReplyTo,
        references: m.references,
        attachments,
        conversationRef: payload.conversationRef,
        sentByStaff: m.sentByStaff,
        viaEmailLayer: true,
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (e instanceof DomainError) {
        // a permanent business refusal that could not be routed to review: retrying cannot help
        this.logger.warn(`Delivery ${payload.deliveryId} refused: ${message}`);
        await this.record(payload, 'rejected', message, prior);
        return 'rejected';
      }
      if (e instanceof AttachmentFetchError || isTransientDbError(e))
        this.logger.warn(`Delivery ${payload.deliveryId} failed, will be retried: ${message}`);
      else
        this.logger.error(
          `Delivery ${payload.deliveryId} failed unexpectedly: ${message}`,
          (e as Error)?.stack,
        );
      await this.record(payload, 'failed', message, prior).catch(() => undefined);
      throw new EmailLayerUnavailableError(message);
    }
    await this.record(payload, 'processed', null, prior);
    return 'processed';
  }

  /** Why this delivery is refused for good (no retry helps), or null. */
  private async rejection(p: DeliveryPayload): Promise<string | null> {
    if (p.product !== PRODUCT) return `Delivery is for product "${p.product}", not "${PRODUCT}"`;
    const ticketNo = p.conversationRef?.match(REF_TICKET)?.[1];
    if (p.conversationRef && !ticketNo) return `Unrecognised conversation ref "${p.conversationRef}"`;
    if (ticketNo && !(await this.tickets.exist({ where: { ticketNo } })))
      return `No ticket ${ticketNo} for conversation ref "${p.conversationRef}"`;
    return null;
  }

  private async record(
    p: DeliveryPayload,
    status: EmailLayerDelivery['status'],
    lastError: string | null,
    prior: EmailLayerDelivery | null,
  ) {
    await this.deliveries.save(
      this.deliveries.create({
        deliveryId: p.deliveryId,
        payload: p,
        status,
        lastError,
        attempts: (prior?.attempts ?? 0) + 1,
        createdAt: prior?.createdAt,
        processedAt: status === 'failed' ? null : new Date(),
      }),
    );
  }
}

async function fetchFile(url: string): Promise<Buffer> {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new AttachmentFetchError(`Attachment fetch answered ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  } catch (e) {
    throw e instanceof AttachmentFetchError
      ? e
      : new AttachmentFetchError(`Attachment fetch failed: ${String(e)}`);
  }
}
