import { AsyncLocalStorage } from 'node:async_hooks';
import type { AuthUser } from '../auth/auth.types';

export interface RequestContextData {
  correlationId: string;
  user?: AuthUser;
}

/** Per-request context (correlation id, user) available anywhere incl. audit + outbox writers. */
export class RequestContext {
  private static readonly als = new AsyncLocalStorage<RequestContextData>();

  static run<T>(data: RequestContextData, fn: () => T): T {
    return this.als.run(data, fn);
  }
  static get(): RequestContextData | undefined {
    return this.als.getStore();
  }
}
