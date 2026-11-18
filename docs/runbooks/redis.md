# Redis (ElastiCache)

**Alarms:** `placement-prod-redis-memory1` / `-memory2`. A node is above 80% memory.

**Impact:** Redis holds the BullMQ queues and timers. It is set to `noeviction`, so it never drops jobs. When it is
full, writes fail instead: enqueues fail (the outbox relay retries) and repeating jobs stop.

## Check

The usual culprit is a pile of failed jobs, which BullMQ keeps on purpose (see
[dead-letter-jobs](dead-letter-jobs.md)). Completed jobs are capped at 1000 per queue. From a worker shell:

```bash
node -e "
const { Queue } = require('bullmq');
const names = ['mail-outbound', 'bimasetu-inbound', 'bimasetu-outbound', 'copycat-runner', 'notifications', 'mail-inbound'];
Promise.all(names.map(n => new Queue(n, { connection: { url: process.env.REDIS_URL } }).getJobCounts()
  .then(c => console.log(n, c)))).then(() => process.exit(0));
"
```

## Fix

- **Dead-lettered jobs:** retry or remove them ([dead-letter-jobs](dead-letter-jobs.md)).
- **Lasting growth:** a bigger node type (`cacheNodeType` in `data-stack.ts`).
