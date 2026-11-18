import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request } from 'express';
import { from, type Observable } from 'rxjs';
import { mergeMap } from 'rxjs/operators';
import { DataSource } from 'typeorm';
import { Role } from '@bimaplacement/contracts';
import { DomainError } from '../../common/errors/domain-error';
import type { AuthUser } from '../../common/auth/auth.types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * FR-208 (Rohit, 2026-11-02): a Placement Manager sees every non-escalated team ticket; tickets escalated to the
 * Placement Head are invisible to PMs everywhere, reported as not found. The Head and Admin see everything.
 */
export const seesEscalated = (user: AuthUser) =>
  user.roles.includes(Role.PLACEMENT_HEAD) || user.roles.includes(Role.ADMIN);

export const isUuid = (s: string) => UUID.test(s);

export async function assertTicketVisible(
  ds: DataSource,
  user: AuthUser,
  ticketId: string | null | undefined,
) {
  if (!ticketId || seesEscalated(user)) return;
  if (!isUuid(ticketId)) return; // the route's ParseUUIDPipe answers 400
  const [row] = await ds.query(`SELECT escalated FROM placement_tickets WHERE id = $1`, [ticketId]);
  if (row?.escalated) throw DomainError.notFound('Ticket', ticketId);
}

/** The ticket a route is about: `:ticketId` on every ticket sub-resource, `:id` on the tickets controller. */
export function routeTicketId(req: Request): string | undefined {
  const params = (req.params ?? {}) as Record<string, string | undefined>;
  if (params.ticketId) return params.ticketId;
  const path = (req.route as { path?: string } | undefined)?.path ?? '';
  return /\/tickets\/:id(\/|$)/.test(path) ? params.id : undefined;
}

/**
 * Applies FR-208 to every ticket-scoped HTTP route in one place, so a new sub-resource cannot forget it.
 * Routes not keyed by the ticket (documents by id, manual review) check visibility in their services.
 */
@Injectable()
export class TicketVisibilityInterceptor implements NestInterceptor {
  constructor(private readonly ds: DataSource) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() !== 'http') return next.handle();
    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const ticketId = routeTicketId(req);
    if (!ticketId || !req.user) return next.handle();
    return from(assertTicketVisible(this.ds, req.user, ticketId)).pipe(mergeMap(() => next.handle()));
  }
}
