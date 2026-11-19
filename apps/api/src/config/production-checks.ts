import type { AppConfig } from './configuration';

/**
 * Settings that are fine on a laptop but unsafe in production (PLAN 4.5). Both processes load the config
 * through configuration.ts, which refuses to start in production while any of these is listed.
 */
export function productionProblems(c: AppConfig): string[] {
  const problems: string[] = [];
  if (c.auth.mode === 'dev') problems.push('AUTH_MODE=dev trusts the x-dev-user header; use sahayak');
  if (c.features.devSimulators) problems.push('FEATURE_DEV_SIMULATORS must be false');
  if (c.storage.driver === 'local')
    problems.push('STORAGE_DRIVER=local keeps documents on the container disk; use s3');
  if (c.malware.driver === 'dev')
    problems.push('MALWARE_SCANNER=dev only detects the EICAR test file; use clamav');
  if (c.bimasetu.mode === 'live' && !c.bimasetu.webhookSecret)
    problems.push('BIMASETU_WEBHOOK_SECRET is required to verify inbound BimaSetu messages');
  if (c.mailbox.driver === 'email-layer' && !c.mailbox.emailLayer.url)
    problems.push('EMAIL_LAYER_URL is required when MAILBOX_DRIVER=email-layer');
  // The delivery webhook is live whatever the driver (ruling R3), so its secret is always checked.
  if (weakSecret(c.mailbox.emailLayer.secret))
    problems.push(
      `EMAIL_LAYER_SECRET must be a real secret of at least ${MIN_SECRET_LENGTH} characters (not the .env.example value)`,
    );
  return problems;
}

const MIN_SECRET_LENGTH = 32;
/** The apps/api/.env.example value, and anything still marked as a placeholder. */
const PLACEHOLDER = /change-me|^dev-email-layer-secret/i;

function weakSecret(secret: string): boolean {
  return !secret || secret.length < MIN_SECRET_LENGTH || PLACEHOLDER.test(secret);
}
