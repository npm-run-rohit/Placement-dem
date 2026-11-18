import { SIGNATURE_HEADER, signEmailLayer } from '../../integrations/email-layer/contract';
import type { SendRequest, SendResponse } from '../../integrations/email-layer/contract';
import type { MailboxConnector, OutboundMail } from './mailbox.port';
import type { StoragePort } from '../storage/storage.port';

/** The layer refused the sender: no connected, send-enabled mailbox (M5). Final: never retry, never fall back. */
export class MailboxNotConnectedError extends Error {
  constructor(mailbox: string) {
    super(`${mailbox} has not connected Gmail for sending`);
    this.name = 'MailboxNotConnectedError';
  }
}

const ATTACHMENT_URL_TTL_SECONDS = 15 * 60;

/**
 * Sends through the shared email layer (docs/integration/EMAIL-LAYER-CONTRACT.md) over signed HTTP.
 * Inbound mail does not come through fetchNew: the layer pushes deliveries to a webhook.
 * Any failure other than MAILBOX_NOT_CONNECTED is a plain Error so the queue job retries
 * (the idempotency key makes a retry safe, incl. 409 SEND_IN_PROGRESS).
 */
export class EmailLayerMailboxAdapter implements MailboxConnector {
  constructor(
    private readonly cfg: { url: string; secret: string },
    private readonly storage: StoragePort,
  ) {}

  private url(path: string) {
    return `${this.cfg.url.replace(/\/+$/, '')}/email-layer/v1${path}`;
  }

  async send(mail: OutboundMail) {
    if (!mail.conversation) throw new Error('Email layer send needs a conversation ref');
    if (!mail.idempotencyKey) throw new Error('Email layer send needs an idempotency key');
    const attachments = await Promise.all(
      (mail.attachments ?? []).map(async (a) => ({
        fileName: a.fileName,
        contentType: a.contentType,
        url: await this.storage.signedDownloadUrl(a.storageKey, a.fileName, ATTACHMENT_URL_TTL_SECONDS),
      })),
    );
    const body: SendRequest = {
      product: 'placement',
      idempotencyKey: mail.idempotencyKey,
      from: mail.fromMailbox,
      to: mail.to,
      ...(mail.cc?.length ? { cc: mail.cc } : {}),
      subject: mail.subject,
      text: mail.text ?? '',
      html: mail.html,
      ...(attachments.length ? { attachments } : {}),
      conversation: mail.conversation,
    };
    const raw = JSON.stringify(body);
    const res = await fetch(this.url('/messages'), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        [SIGNATURE_HEADER]: signEmailLayer(raw, this.cfg.secret),
      },
      body: raw,
    });
    if (res.ok) {
      const r = (await res.json()) as SendResponse;
      return { providerMessageId: r.rfcMessageId, providerThreadId: r.gmailThreadId };
    }
    const err = (await res.json().catch(() => ({}))) as { code?: string };
    if (res.status === 409 && err.code === 'MAILBOX_NOT_CONNECTED')
      throw new MailboxNotConnectedError(mail.fromMailbox);
    throw new Error(`Email layer send failed: ${res.status}${err.code ? ` ${err.code}` : ''}`);
  }

  async fetchNew(_mailbox: string, cursor: string | null) {
    return { messages: [], nextCursor: cursor };
  }

  async health(mailbox: string) {
    const res = await fetch(this.url('/health?product=placement'));
    if (!res.ok) return { ok: false, detail: `Email layer health ${res.status}` };
    const h = (await res.json()) as { ok: boolean; mailboxesWithoutSend: string[] };
    if (h.mailboxesWithoutSend?.includes(mailbox))
      return { ok: false, detail: `${mailbox} has not connected Gmail for sending` };
    return h.ok ? { ok: true } : { ok: false, detail: 'Email layer reports not ok' };
  }
}
