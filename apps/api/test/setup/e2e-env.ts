import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Environment for the e2e run. Override the DB/Redis targets with E2E_DATABASE_URL / E2E_REDIS_URL.
 * The database is dropped and recreated on every run, so its name must end with `_e2e`;
 * Redis uses a non-zero db index that is flushed on every run.
 */
export const E2E_ENV = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  DATABASE_URL: process.env.E2E_DATABASE_URL ?? 'postgres://placement:placement@localhost:5432/placement_e2e',
  MESSAGING_DRIVER: 'bullmq',
  REDIS_URL: process.env.E2E_REDIS_URL ?? 'redis://localhost:6379/15',
  STORAGE_DRIVER: 'local',
  STORAGE_LOCAL_DIR: join(tmpdir(), 'bimaplacement-e2e-uploads'),
  AUTH_MODE: 'dev',
  BIMASETU_MODE: 'mock',
  BIMASETU_WEBHOOK_SECRET: 'e2e-webhook-secret', // signature checked whenever a secret is set (PLAN 4.5)
  COPYCAT_MODE: 'mock',
  COPYCAT_MOCK_DELAY_MS: '0',
  MAILBOX_DRIVER: 'dev',
  SMTP_HOST: '', // dev mailbox logs instead of sending (no Mailpit in CI)
  FEATURE_DEV_SIMULATORS: 'true',
  SAHAYAK_NOTIFICATIONS_ENABLED: 'false',
};

/** Explicit values win over apps/api/.env (ConfigModule never overrides variables already set). */
export function applyE2eEnv() {
  Object.assign(process.env, E2E_ENV);
}
