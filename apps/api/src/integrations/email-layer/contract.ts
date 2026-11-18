import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Email layer contract v1 (docs/integration/EMAIL-LAYER-CONTRACT.md).
 * Identical copy lives in email-parser-scaffold: email-parser/email-layer/contract.ts.
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
