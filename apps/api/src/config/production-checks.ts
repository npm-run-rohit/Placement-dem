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
  // Stand-ins boot fine and look healthy while nothing leaves the building: the mock BimaSetu drops every
  // message to the RM, the mock Copycat invents QCR figures, and the dev / unbuilt Gmail and Graph mailboxes
  // only log insurer mail. Production refuses them until the live integrations are configured.
  if (c.bimasetu.mode === 'mock')
    problems.push('BIMASETU_MODE=mock sends nothing to BimaSetu; use live once the contract is built');
  if (c.bimasetu.mode === 'live' && !c.bimasetu.apiUrl)
    problems.push('BIMASETU_API_URL is required in live mode');
  if (c.bimasetu.mode === 'live' && !c.bimasetu.webhookSecret)
    problems.push('BIMASETU_WEBHOOK_SECRET is required to verify inbound BimaSetu messages');
  if (c.copycat.mode === 'mock')
    problems.push('COPYCAT_MODE=mock invents QCR figures; use live once the Copycat API is built');
  if (c.copycat.mode === 'live' && (!c.copycat.endpoint || !c.copycat.apiKey))
    problems.push('COPYCAT_ENDPOINT and COPYCAT_API_KEY are required in live mode');
  if (c.mailbox.driver !== 'email-layer')
    problems.push(
      `MAILBOX_DRIVER=${c.mailbox.driver} does not deliver insurer mail from the PM mailbox; use email-layer`,
    );
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
