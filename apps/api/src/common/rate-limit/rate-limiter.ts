import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import IORedis from 'ioredis';
import type { AppConfig } from '../../config/configuration';

/**
 * Fixed-window request counter (PLAN 4.5). Redis when the messaging driver is BullMQ, so every API instance
 * shares the count; in memory otherwise (single instance, or until the AWS driver brings its own store).
 */
@Injectable()
export class RateLimiter implements OnModuleDestroy {
  private readonly redis: IORedis | null;
  private readonly memory = new Map<string, { count: number; resetAt: number }>();

  constructor(config: ConfigService<AppConfig, true>) {
    const m = config.get('messaging', { infer: true });
    this.redis =
      m.driver === 'bullmq' ? new IORedis(m.redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 }) : null;
  }

  /** Counts one request for `key`; true while the window's count is within `limit`. */
  async allow(key: string, limit: number, windowSec: number): Promise<boolean> {
    const bucket = `ratelimit:${key}:${Math.floor(Date.now() / 1000 / windowSec)}`;
    if (this.redis) {
      const [[, count]] = (await this.redis.multi().incr(bucket).expire(bucket, windowSec).exec()) as Array<
        [Error | null, number]
      >;
      return count <= limit;
    }
    const now = Date.now();
    const entry = this.memory.get(key);
    if (!entry || entry.resetAt <= now) {
      this.memory.set(key, { count: 1, resetAt: now + windowSec * 1000 });
      return 1 <= limit;
    }
    entry.count += 1;
    return entry.count <= limit;
  }

  async onModuleDestroy() {
    await this.redis?.quit().catch(() => undefined);
  }
}
