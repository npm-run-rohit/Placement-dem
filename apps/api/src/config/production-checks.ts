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
  if (c.mailbox.driver === 'email-layer') {
    if (!c.mailbox.emailLayer.url)
      problems.push('EMAIL_LAYER_URL is required when MAILBOX_DRIVER=email-layer');
    if (!c.mailbox.emailLayer.secret)
      problems.push('EMAIL_LAYER_SECRET is required when MAILBOX_DRIVER=email-layer');
  }
  return problems;
}
