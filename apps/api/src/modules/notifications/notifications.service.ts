import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import type { NotificationView } from '@bimaplacement/contracts';
import { PlacementTicket } from '../tickets/entities/placement-ticket.entity';
import { Notification } from './notification.entity';

/** In-app inbox + delivery log. External channels go through BimaSahayak notifications (W9). */
@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification) private readonly repo: Repository<Notification>,
    @InjectRepository(PlacementTicket) private readonly tickets: Repository<PlacementTicket>,
  ) {}

  async mine(userId: string): Promise<NotificationView[]> {
    const rows = await this.repo.find({
      where: { recipientUserId: userId },
      order: { createdAt: 'DESC' },
      take: 50,
    });
    const ids = [...new Set(rows.map((r) => r.ticketId).filter((x): x is string => !!x))];
    const nos = new Map(
      (ids.length
        ? await this.tickets.find({ where: { id: In(ids) }, select: { id: true, ticketNo: true } })
        : []
      ).map((t) => [t.id, t.ticketNo]),
    );
    return rows.map((r) => ({
      id: r.id,
      eventType: r.eventType,
      title: r.title,
      body: r.body,
      ticketNo: r.ticketId ? (nos.get(r.ticketId) ?? null) : null,
      link: r.link,
      read: !!r.readAt,
      createdAt: r.createdAt.toISOString(),
    }));
  }

  async unreadCount(userId: string): Promise<{ count: number }> {
    return { count: await this.repo.count({ where: { recipientUserId: userId, readAt: IsNull() } }) };
  }

  async markRead(userId: string, id: string) {
    await this.repo.update({ id, recipientUserId: userId, readAt: IsNull() }, { readAt: new Date() });
  }

  async markAllRead(userId: string) {
    await this.repo.update({ recipientUserId: userId, readAt: IsNull() }, { readAt: new Date() });
  }
}
