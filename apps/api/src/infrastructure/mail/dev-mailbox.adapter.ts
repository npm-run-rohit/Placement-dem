import { Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { createTransport, type Transporter } from 'nodemailer';
import type { InboundMailRaw, MailboxConnector, OutboundMail } from './mailbox.port';
import type { StoragePort } from '../storage/storage.port';

/**
 * Dev connector: delivers outbound mail to Mailpit over SMTP (docker-compose; read it at http://localhost:8025)
 * and lets dev simulators push inbound mail. An empty SMTP_HOST only logs (e2e / CI). Delivery problems are
 * logged, never thrown: this is a dev aid, not a provider.
 */
export class DevMailboxAdapter implements MailboxConnector {
  private readonly logger = new Logger('DevMailbox');
  private readonly inbox: InboundMailRaw[] = [];
  private readonly smtp: Transporter | null;

  constructor(
    cfg: { smtpHost: string; smtpPort: number } = { smtpHost: '', smtpPort: 1025 },
    private readonly storage?: StoragePort,
  ) {
    this.smtp = cfg.smtpHost
      ? createTransport({ host: cfg.smtpHost, port: cfg.smtpPort, secure: false, ignoreTLS: true })
      : null;
  }

  async send(mail: OutboundMail) {
    const providerMessageId = `dev-${randomUUID()}@bimaplacement.local`;
    this.logger.log(`MAIL from=${mail.fromMailbox} to=${mail.to.join(',')} subject="${mail.subject}"`);
    if (this.smtp) {
      try {
        await this.smtp.sendMail({
          messageId: `<${providerMessageId}>`,
          from: mail.fromMailbox,
          to: mail.to,
          cc: mail.cc,
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
          headers: mail.headers,
          inReplyTo: mail.inReplyToProviderId ?? undefined,
          attachments: this.storage
            ? await Promise.all(
                (mail.attachments ?? []).map(async (a) => ({
                  filename: a.fileName,
                  contentType: a.contentType,
                  content: await this.storage!.get(a.storageKey),
                })),
              )
            : [],
        });
      } catch (e) {
        this.logger.warn(`Mailpit delivery skipped: ${(e as Error).message}`);
      }
    }
    return { providerMessageId };
  }

  /**
   * DEV ONLY: a copy of a simulated inbound mail (insurer reply) for Mailpit, so a demo shows the insurer's side
   * too. Called only from the dev simulators; real inbound processing never goes through here. Nothing is recorded.
   */
  async mirrorInbound(mail: {
    from: string;
    to: string[];
    cc?: string[];
    subject: string;
    text: string;
    attachments?: Array<{ fileName: string; contentType: string; content: Buffer }>;
  }): Promise<boolean> {
    if (!this.smtp) return false;
    try {
      await this.smtp.sendMail({
        messageId: `<dev-in-${randomUUID()}@insurer.example.test>`,
        from: mail.from,
        to: mail.to,
        cc: mail.cc,
        subject: mail.subject,
        text: mail.text,
        headers: { 'X-Placement-Dev-Simulated': 'insurer-reply' },
        attachments: (mail.attachments ?? []).map((a) => ({
          filename: a.fileName,
          contentType: a.contentType,
          content: a.content,
        })),
      });
      return true;
    } catch (e) {
      this.logger.warn(`Mailpit copy skipped: ${(e as Error).message}`);
      return false;
    }
  }

  /** Used by /dev/simulate endpoints to inject an inbound insurer/RM mail. */
  push(raw: InboundMailRaw) {
    this.inbox.push(raw);
  }

  async fetchNew(mailbox: string) {
    const messages = this.inbox.filter((m) => m.mailbox === mailbox);
    this.inbox.splice(0, this.inbox.length, ...this.inbox.filter((m) => m.mailbox !== mailbox));
    return { messages, nextCursor: null };
  }

  async health(mailboxes: string[]) {
    return Object.fromEntries(mailboxes.map((m) => [m, { ok: true }]));
  }
}
