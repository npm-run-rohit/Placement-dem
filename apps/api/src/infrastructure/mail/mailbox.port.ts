/**
 * PM mailbox connector (PRD FR-166..171): outbound insurer/RM mail is sent FROM the assigned
 * PM's own work mailbox; inbound insurer replies are read from it. Provider-agnostic.
 * Default provider assumption: Google Workspace (Gmail API, domain-wide delegation) since
 * BimaKavach uses Google Workspace SSO. Microsoft Graph adapter kept as an option.
 */
export interface OutboundMail {
  fromMailbox: string; // PM email identity (never silently substituted - M5 validation)
  to: string[];
  cc?: string[];
  subject: string; // includes [PLC-nnnn | TH-nn] for inbound mapping (FR-050)
  html: string;
  text?: string;
  attachments?: Array<{ fileName: string; contentType: string; storageKey: string }>;
  inReplyToProviderId?: string | null;
  headers?: Record<string, string>; // X-Placement-Ticket, X-Placement-Thread
  /** Shared email layer: conversation key (PLC-nnnn/TH-nn or PLC-nnnn/RM) and the message to reply to. */
  conversation?: { ref: string; replyToMessageId?: string };
  /** Makes a retried send safe (outbox id). */
  idempotencyKey?: string;
}

export interface InboundMailRaw {
  providerMessageId: string;
  providerThreadId?: string | null;
  mailbox: string;
  from: string;
  to: string[];
  cc: string[];
  subject: string;
  textBody: string;
  htmlBody?: string | null;
  receivedAt: Date;
  inReplyTo?: string | null;
  references?: string[];
  attachments: Array<{ fileName: string; contentType: string; size: number; fetch: () => Promise<Buffer> }>;
}

export interface MailboxConnector {
  send(mail: OutboundMail): Promise<{ providerMessageId: string; providerThreadId?: string }>;
  /** Pull new messages since the stored cursor (history id / delta token). */
  fetchNew(
    mailbox: string,
    cursor: string | null,
  ): Promise<{ messages: InboundMailRaw[]; nextCursor: string | null }>;
  health(mailbox: string): Promise<{ ok: boolean; detail?: string }>;
}

export const MAILBOX = Symbol('MAILBOX');
