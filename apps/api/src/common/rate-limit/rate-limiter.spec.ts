import type { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration';
import { RateLimiter } from './rate-limiter';

describe('RateLimiter (in memory)', () => {
  const config = {
    get: () => ({ driver: 'aws', redisUrl: '' }),
  } as unknown as ConfigService<AppConfig, true>;

  it('allows up to the limit per key and window', async () => {
    const limiter = new RateLimiter(config);
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await limiter.allow('ip-a', 3, 60));
    expect(results).toEqual([true, true, true, false]);
    expect(await limiter.allow('ip-b', 3, 60)).toBe(true);
  });
});
