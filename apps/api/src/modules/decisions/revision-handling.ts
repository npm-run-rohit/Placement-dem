import { IsNull } from 'typeorm';
import { Task } from '../tasks/task.entity';
import type { WorkflowContext } from '../tickets/ticket-workflow.service';
import { Revision } from './entities/revision.entity';

export type RevisionHandledVia = 'restart_threads' | 'add_insurer' | 'new_rfq_version';

const VIA_LABEL: Record<RevisionHandledVia, string> = {
  restart_threads: 'threads restarted',
  add_insurer: 'insurer added',
  new_rfq_version: 'RFQ V2 created',
};

/**
 * FR-250: a revision stays open (and its PM task too) until the PM restarts threads, approaches more
 * insurers or creates a new RFQ version. Call inside the action's workflow transaction; a no-op when no
 * revision is open, so the actions can call it unconditionally.
 */
export async function markRevisionHandled(ctx: WorkflowContext, via: RevisionHandledVia): Promise<void> {
  const revisions = ctx.manager.getRepository(Revision);
  const open = await revisions.findOne({
    where: { ticketId: ctx.ticket.id, handledAt: IsNull() },
    order: { round: 'DESC' },
  });
  if (!open) return;
  open.handledAt = ctx.now;
  open.handledById = ctx.actor.id;
  open.handledVia = via;
  await revisions.save(open);
  await ctx.manager
    .getRepository(Task)
    .update(
      { ticketId: ctx.ticket.id, kind: 'revision_request', status: 'open' },
      { status: 'done', completedAt: ctx.now },
    );
  await ctx.audit(`Revision round ${open.round} handled`, VIA_LABEL[via]);
}

/** FR-250: the owner's task for a new revision round. */
export async function createRevisionTask(ctx: WorkflowContext, round: number): Promise<void> {
  if (!ctx.ticket.ownerId) return;
  await ctx.manager.getRepository(Task).insert({
    ticketId: ctx.ticket.id,
    threadId: null,
    kind: 'revision_request',
    label: `Revision round ${round}: restart threads, add an insurer or create RFQ V2`,
    assigneeId: ctx.ticket.ownerId,
    dueAt: null,
    status: 'open',
    completedAt: null,
  });
}
