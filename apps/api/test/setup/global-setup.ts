import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import IORedis from 'ioredis';
import { Client } from 'pg';
import { E2E_ENV, applyE2eEnv } from './e2e-env';

const API_DIR = resolve(__dirname, '../..');

/**
 * Fresh database per run: drop + create, run the real migrations and the PRD master seed.
 * A new database (not TRUNCATE) because audit-grade tables reject DELETE by trigger.
 */
export default async function globalSetup() {
  applyE2eEnv();

  const dbUrl = new URL(E2E_ENV.DATABASE_URL);
  const dbName = dbUrl.pathname.slice(1);
  if (!dbName.endsWith('_e2e'))
    throw new Error(`Refusing to reset database "${dbName}": e2e database names must end with _e2e`);
  const adminUrl = new URL(dbUrl);
  adminUrl.pathname = '/postgres';
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  try {
    await admin.query(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`);
    await admin.query(`CREATE DATABASE "${dbName}"`);
  } finally {
    await admin.end();
  }

  run('npm run migration:run');
  run('npm run seed');

  const redisUrl = new URL(E2E_ENV.REDIS_URL);
  if (!Number(redisUrl.pathname.slice(1)))
    throw new Error(`Refusing to flush Redis db 0: set E2E_REDIS_URL to a non-zero db index`);
  const redis = new IORedis(E2E_ENV.REDIS_URL, { maxRetriesPerRequest: 1 });
  try {
    await redis.flushdb();
  } finally {
    redis.disconnect();
  }
}

function run(cmd: string) {
  try {
    execSync(cmd, { cwd: API_DIR, env: process.env, stdio: 'pipe' });
  } catch (err) {
    const e = err as { stdout?: Buffer; stderr?: Buffer };
    throw new Error(
      `e2e setup: "${cmd}" failed\n${e.stdout?.toString() ?? ''}\n${e.stderr?.toString() ?? ''}`,
    );
  }
}
