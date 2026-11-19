import { SIGNATURE_HEADER, signEmailLayer } from '../../integrations/email-layer/contract';
import type {
  HealthResponse,
  SendErrorCode,
  SendRequest,
  SendResponse,
} from '../../integrations/email-layer/contract';
import type { MailboxConnector, MailboxHealth, OutboundMail } from './mailbox.port';
import type { StoragePort } from '../storage/storage.port';

/** The layer refused the sender: no connected, send-enabled mailbox (M5). Final: never retry, never fall back. */
export class MailboxNotConnectedError extends Error {
  constructor(mailbox: string) {
    super(`${mailbox} has not connected Gmail for sending`);
    this.name = 'MailboxNotConnectedError';
  }
}

/** Gmail refused the mail for good (e.g. a bad recipient): 422 SEND_REJECTED. Final: never retry. */
export class MailRejectedError extends Error {
  constructor(detail: string) {
    super(`The mail was refused: ${detail}`);
    this.name = 'MailRejectedError';
  }
}

const ATTACHMENT_URL_TTL_SECONDS = 15 * 60;
/** A send may fetch attachments and call Gmail; a retry with the same idempotency key is safe. */
const SEND_TIMEOUT_MS = 120_000;
const HEALTH_TIMEOUT_MS = 5_000;

/**
 * Sends through the shared email layer (docs/integration/EMAIL-LAYER-CONTRACT.md) over signed HTTP.
 * Inbound mail does not come through fetchNew: the layer pushes deliveries to a webhook.
 * MAILBOX_NOT_CONNECTED and SEND_REJECTED are final; any other failure (incl. a timeout and
 * 409 SEND_IN_PROGRESS) is a plain Error so the queue job retries (the idempotency key makes it safe).
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
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    if (res.ok) {
      const r = (await res.json()) as SendResponse;
      return { providerMessageId: r.rfcMessageId, providerThreadId: r.gmailThreadId };
    }
    const err = (await res.json().catch(() => ({}))) as { code?: SendErrorCode; message?: string };
    if (res.status === 409 && err.code === 'MAILBOX_NOT_CONNECTED')
      throw new MailboxNotConnectedError(mail.fromMailbox);
    if (res.status === 422 && err.code === 'SEND_REJECTED')
      throw new MailRejectedError(err.message ?? 'Gmail refused the mail');
    throw new Error(`Email layer send failed: ${res.status}${err.code ? ` ${err.code}` : ''}`);
  }

  async fetchNew(_mailbox: string, cursor: string | null) {
    return { messages: [], nextCursor: cursor };
  }

  /**
   * One call for all mailboxes. Only a mailbox the layer lists in `connected` can send; anyone
   * else has not connected (or must reconnect to grant sending). Never throws: a network error
   * or a bad answer reports every mailbox as not ok.
   */
  async health(mailboxes: string[]): Promise<Record<string, MailboxHealth>> {
    const all = (h: MailboxHealth) => Object.fromEntries(mailboxes.map((m) => [m, h]));
    let h: HealthResponse;
    try {
      const res = await fetch(this.url('/health?product=placement'), {
        signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
      });
      if (!res.ok) return all({ ok: false, detail: `Email layer health ${res.status}` });
      h = (await res.json()) as HealthResponse;
    } catch (e) {
      return all({
        ok: false,
        detail: `Email layer unreachable: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
    if (!h.ok) return all({ ok: false, detail: 'Email layer reports not ok' });
    const lower = (xs: string[] | undefined) => new Set((xs ?? []).map((x) => x.toLowerCase()));
    const connected = lower(h.connected);
    const withoutSend = lower(h.mailboxesWithoutSend);
    return Object.fromEntries(
      mailboxes.map((m): [string, MailboxHealth] => {
        const key = m.toLowerCase();
        if (connected.has(key)) return [m, { ok: true }];
        if (withoutSend.has(key))
          return [m, { ok: false, detail: `${m} must reconnect Gmail to allow sending` }];
        return [m, { ok: false, detail: `${m} has not connected Gmail` }];
      }),
    );
  }
}
