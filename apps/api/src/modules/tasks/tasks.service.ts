import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import type { TaskView } from '@bimaplacement/contracts';
import { DomainError } from '../../common/errors/domain-error';
import { PlacementTicket } from '../tickets/entities/placement-ticket.entity';
import { Task } from './task.entity';

const TAB: Partial<Record<Task['kind'], string>> = {
  revision_request: 'qcr',
  call_insurer: 'threads',
  reply_insurer: 'threads',
  review_quote: 'quotes',
};

/** PM work items (FR-250 revision tasks; call / reply tasks later): `/me/tasks`. */
@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(Task) private readonly repo: Repository<Task>,
    @InjectRepository(PlacementTicket) private readonly tickets: Repository<PlacementTicket>,
  ) {}

  async mine(userId: string, status: 'open' | 'all'): Promise<TaskView[]> {
    const rows = await this.repo.find({
      where: { assigneeId: userId, ...(status === 'open' ? { status: 'open' as const } : {}) },
      order: { createdAt: 'DESC' },
      take: 100,
    });
    const ts = rows.length
      ? await this.tickets.find({
          where: { id: In([...new Set(rows.map((r) => r.ticketId))]) },
          select: { id: true, ticketNo: true, businessName: true },
        })
      : [];
    const byId = new Map(ts.map((t) => [t.id, t]));
    return rows
      .filter((r) => byId.has(r.ticketId))
      .map((r) => {
        const t = byId.get(r.ticketId)!;
        const tab = TAB[r.kind];
        return {
          id: r.id,
          kind: r.kind,
          label: r.label,
          ticketNo: t.ticketNo,
          businessName: t.businessName,
          link: `/tickets/${t.ticketNo}${tab ? `/${tab}` : ''}`,
          dueAt: r.dueAt?.toISOString() ?? null,
          status: r.status,
          createdAt: r.createdAt.toISOString(),
        };
      });
  }

  /** Close a task by hand (revision tasks also close themselves when the revision is handled). */
  async complete(userId: string, id: string) {
    const task = await this.repo.findOneBy({ id, assigneeId: userId });
    if (!task) throw DomainError.notFound('Task', id);
    if (task.status !== 'open') return;
    await this.repo.update({ id }, { status: 'done', completedAt: new Date() });
  }
}
