import { Client } from 'pg';

/**
 * Runs `fn` and reports the most queries ever in flight at once on a single pg client. More than 1 means
 * overlapping queries on one connection (e.g. TypeORM save(array) inside a transaction): pg deprecates
 * it and pg@9 rejects it.
 */
export async function maxQueryOverlap(fn: () => Promise<unknown>): Promise<number> {
  const inFlight = new WeakMap<object, number>();
  let max = 0;
  const original = Client.prototype.query;
  Client.prototype.query = function (this: object, ...args: unknown[]) {
    const now = (inFlight.get(this) ?? 0) + 1;
    inFlight.set(this, now);
    max = Math.max(max, now);
    const res = (original as (...a: unknown[]) => unknown).apply(this, args);
    const done = () => inFlight.set(this, (inFlight.get(this) ?? 1) - 1);
    if (res && typeof (res as Promise<unknown>).then === 'function')
      (res as Promise<unknown>).then(done, done);
    else done();
    return res;
  } as typeof Client.prototype.query;
  try {
    await fn();
  } finally {
    Client.prototype.query = original;
  }
  return max;
}
