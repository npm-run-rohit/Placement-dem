import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import { from, Observable, of, throwError } from 'rxjs';
import { catchError, mergeMap } from 'rxjs/operators';
import { DataSource } from 'typeorm';
import { DomainError } from '../errors/domain-error';
import { IdempotencyKey } from './idempotency-key.entity';

export const IDEMPOTENCY_HEADER = 'idempotency-key';
const TTL_MS = 24 * 60 * 60 * 1000;
const MUTATING = new Set(['POST', 'PUT', 'PATCH']);

/**
 * Idempotency for mutating commands (PRD 10.2 - safe retry). Opt-in per request: a POST / PUT / PATCH that
 * carries `Idempotency-Key` runs once per user and key; a retry within 24 h gets the stored response,
 * the same key with a different request is refused (422), and a retry while the first is still running
 * gets 409. A failed request releases its key so it can be retried. Inbound webhooks use their own
 * inbox-table dedupe (BimaSetu messageId, inbound mail provider id).
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly ds: DataSource) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() !== 'http') return next.handle();
    const req = ctx.switchToHttp().getRequest<Request & { user?: { id: string } }>();
    const key = req.header(IDEMPOTENCY_HEADER)?.trim();
    if (!key || !MUTATING.has(req.method) || !req.user) return next.handle();
    if (key.length > 200)
      return throwError(() => DomainError.guard('Idempotency-Key is too long (max 200 characters)'));
    const res = ctx.switchToHttp().getResponse<Response>();
    const userId = req.user.id;
    const requestHash = createHash('sha256')
      .update(`${req.method} ${req.originalUrl}\n${JSON.stringify(req.body ?? null)}`)
      .digest('hex');
    const repo = this.ds.getRepository(IdempotencyKey);

    return from(this.claim(userId, key, requestHash)).pipe(
      mergeMap((stored) => {
        if (stored) {
          res.status(stored.statusCode);
          res.setHeader('Idempotent-Replayed', 'true');
          return of(stored.response);
        }
        return next.handle().pipe(
          mergeMap((body) =>
            from(
              repo.update({ userId, key }, { statusCode: res.statusCode, response: (body ?? null) as never }),
            ).pipe(mergeMap(() => of(body))),
          ),
          catchError((err) => from(repo.delete({ userId, key })).pipe(mergeMap(() => throwError(() => err)))),
        );
      }),
    );
  }

  /** Reserve the key, or return the stored response of a completed earlier request. */
  private async claim(
    userId: string,
    key: string,
    requestHash: string,
  ): Promise<{ statusCode: number; response: unknown } | null> {
    const repo = this.ds.getRepository(IdempotencyKey);
    await repo
      .createQueryBuilder()
      .delete()
      .where('user_id = :userId AND key = :key AND created_at < :cutoff', {
        userId,
        key,
        cutoff: new Date(Date.now() - TTL_MS),
      })
      .execute();
    const inserted = await repo
      .createQueryBuilder()
      .insert()
      .values({ userId, key, requestHash })
      .orIgnore()
      .returning(['id'])
      .execute();
    if (inserted.identifiers[0]?.id) return null;
    const existing = await repo.findOneBy({ userId, key });
    if (!existing)
      throw new DomainError('CONFLICT', 'Request with this Idempotency-Key is still in progress');
    if (existing.requestHash !== requestHash)
      throw DomainError.guard('Idempotency-Key was already used for a different request');
    if (existing.statusCode === null)
      throw new DomainError('CONFLICT', 'Request with this Idempotency-Key is still in progress');
    return { statusCode: existing.statusCode, response: existing.response };
  }
}
