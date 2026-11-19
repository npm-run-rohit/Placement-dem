import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Email layer contract v1. This file is identical, byte for byte, in both repos:
 * bimaplacement apps/api/src/integrations/email-layer/contract.ts and
 * email-parser-scaffold email-parser/email-layer/contract.ts. The contract doc is identical too:
 * bimaplacement docs/integration/EMAIL-LAYER-CONTRACT.md and email-parser-scaffold docs/email-layer-contract.md.
 */
export interface SendRequest {
  product: string;
  idempotencyKey: string;
  from: string;
  to: string[];
  cc?: string[];
  subject: string;
  text: string;
  html?: string;
  attachments?: Array<{ fileName: string; contentType: string; url: string }>;
  conversation: { ref: string; replyToMessageId?: string };
}

export interface SendResponse {
  rfcMessageId: string;
  gmailMessageId: string;
  gmailThreadId: string;
  sentAt: string;
}

export interface DeliveryPayload {
  deliveryId: string;
  product: string;
  conversationRef: string | null;
  rootMessageId: string;
  message: {
    rfcMessageId: string;
    inReplyTo: string | null;
    references: string[];
    from: string;
    to: string[];
    cc: string[];
    subject: string;
    textBody: string;
    htmlBody: string | null;
    sentAt: string;
    seenInMailboxes: string[];
    sentByStaff: boolean;
    attachments: Array<{ fileName: string; contentType: string; size: number; url: string }>;
  };
}

/** GET /email-layer/v1/health?product=<name>. Anyone listed in neither array has not connected at all. */
export interface HealthResponse {
  ok: boolean;
  /** Active mailboxes of the product that can send (connected with the gmail.send scope). */
  connected: string[];
  /** Active mailboxes of the product that cannot send yet (they must reconnect to grant gmail.send). */
  mailboxesWithoutSend: string[];
}

/**
 * `code` in the body of an error answer to POST /email-layer/v1/messages.
 * MAILBOX_NOT_CONNECTED (409) and SEND_REJECTED (422) are final; SEND_IN_PROGRESS (409) is retried.
 */
export type SendErrorCode = 'MAILBOX_NOT_CONNECTED' | 'SEND_IN_PROGRESS' | 'SEND_REJECTED';

export const SIGNATURE_HEADER = 'x-email-layer-signature';

/** Header `t=<unix>,v1=<hex hmac-sha256 of "${t}.${rawBody}">`; same scheme as bimasetu/hmac.ts. */
export function signEmailLayer(rawBody: string, secret: string, t = Math.floor(Date.now() / 1000)): string {
  return `t=${t},v1=${createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex')}`;
}

export function verifyEmailLayerSignature(
  rawBody: string,
  header: string | undefined,
  secret: string,
  toleranceSec: number,
  nowSec = Math.floor(Date.now() / 1000),
): boolean {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(header.split(',').map((kv) => kv.split('=') as [string, string]));
  const t = Number(parts.t);
  if (!t || Math.abs(nowSec - t) > toleranceSec || !parts.v1) return false;
  const expected = createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(parts.v1);
  return a.length === b.length && timingSafeEqual(a, b);
}
