import { DomainError } from '../../common/errors/domain-error';
import type { MailboxConnector, OutboundMail } from './mailbox.port';

/**
 * Google Workspace connector (Gmail API with domain-wide delegation, impersonating the PM).
 * TODO(W5):
 *  - send: users.messages.send (RFC 2822 with attachments from storage), keep threadId per insurer thread
 *  - fetchNew: users.history.list from stored historyId (or Pub/Sub watch -> MAIL_INBOUND queue)
 *  - health: token refresh + users.getProfile; surface failures on Admin > Mailbox connectors (FR-188)
 * Alternative per Architecture plan: SES inbound + per-placement plus-addressing. See ADR-0004.
 */
export class GmailMailboxAdapter implements MailboxConnector {
  async send(_mail: OutboundMail): Promise<{ providerMessageId: string }> {
    throw DomainError.notImplemented('GmailMailboxAdapter.send');
  }
  async fetchNew(): Promise<{ messages: never[]; nextCursor: string | null }> {
    throw DomainError.notImplemented('GmailMailboxAdapter.fetchNew');
  }
  async health() {
    return { ok: false, detail: 'not implemented' };
  }
}
