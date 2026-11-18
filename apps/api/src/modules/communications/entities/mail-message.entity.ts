import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { MailDirection } from '@bimaplacement/contracts';

/**
 * Mail Trail (Case workspace > Mail Trail). Every outbound mail we send and every inbound
 * mail mapped to a ticket, with recipients and attachments (FR-053, FR-221). Append-only.
 */
@Entity('mail_messages')
@Index('ix_mail_ticket_at', ['ticketId', 'at'])
@Index('ux_mail_outbox', ['outboxId'], { unique: true, where: 'outbox_id IS NOT NULL' })
export class MailMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'ticket_id', type: 'uuid' })
  ticketId: string;

  @Column({ name: 'thread_id', type: 'uuid', nullable: true })
  threadId: string | null; // null = RM conversation

  @Column({ type: 'text' })
  direction: MailDirection;

  @Column({ name: 'template_id', type: 'text', nullable: true })
  templateId: string | null;

  @Column({ name: 'from_address', type: 'text' })
  fromAddress: string;

  @Column({ name: 'to_addresses', type: 'text', array: true })
  toAddresses: string[];

  @Column({ name: 'cc_addresses', type: 'text', array: true, default: '{}' })
  ccAddresses: string[];

  @Column({ type: 'text' })
  subject: string;

  @Column({ name: 'body_html', type: 'text' })
  bodyHtml: string;

  @Column({ name: 'attachment_document_ids', type: 'uuid', array: true, default: '{}' })
  attachmentDocumentIds: string[];

  @Column({ name: 'rfq_link_in_body', type: 'boolean', default: false })
  rfqLinkInBody: boolean;

  /** outbound: the outbox event that produced it (idempotency - one mail per event) */
  @Column({ name: 'outbox_id', type: 'uuid', nullable: true })
  outboxId: string | null;

  @Column({ name: 'provider_message_id', type: 'text', nullable: true })
  providerMessageId: string | null;

  @Column({ type: 'text', default: 'queued' })
  status: 'queued' | 'sent' | 'failed' | 'bounced' | 'received';

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  at: Date;
}
