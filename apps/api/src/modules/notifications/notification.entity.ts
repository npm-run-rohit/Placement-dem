import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import { NotificationChannel } from '@bimaplacement/contracts';

/** Notification log + in-app inbox (PRD 7). Delivery to email/Slack/WhatsApp via BimaSahayak. */
@Entity('notifications')
@Index('ix_notification_recipient', ['recipientUserId', 'readAt'])
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'recipient_user_id', type: 'uuid' })
  recipientUserId: string;

  @Column({ name: 'ticket_id', type: 'uuid', nullable: true })
  ticketId: string | null;

  /** Source outbox event: one row per (event, recipient), so a re-delivered job never duplicates. */
  @Column({ name: 'outbox_id', type: 'uuid', nullable: true })
  outboxId: string | null;

  @Column({ name: 'event_type', type: 'text', nullable: true })
  eventType: string | null;

  /** In-app route the notification opens, e.g. /tickets/PLC-1001/quotes. */
  @Column({ type: 'text', nullable: true })
  link: string | null;

  @Column({ type: 'text' })
  channel: NotificationChannel;

  @Column({ name: 'template_id', type: 'text' })
  templateId: string; // INT-T01 ...

  @Column({ type: 'text' })
  title: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'text', default: 'pending' })
  status: 'pending' | 'sent' | 'failed';

  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ name: 'read_at', type: 'timestamptz', nullable: true })
  readAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
