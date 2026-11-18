import { type App } from 'aws-cdk-lib';

export interface EnvConfig {
  envName: 'prod';
  account: string;
  region: string;
  /** API host: BimaSetu webhooks and the web app's /api/* (through CloudFront) land here. */
  apiDomain: string;
  /** Web app host (CloudFront). */
  appDomain: string;
  /** Either a Route 53 zone (DNS-validated certificate + records) or an existing regional ACM certificate. */
  hostedZoneName?: string;
  hostedZoneId?: string;
  certificateArn?: string;
  /** us-east-1 ACM certificate for appDomain on CloudFront; without it the app is served on *.cloudfront.net. */
  webCertificateArn?: string;
  alertEmail: string;
  multiAz: boolean;
  /**
   * Plain (non-secret) app settings merged over the production defaults in app-stack.ts, e.g. SAHAYAK_ISSUER,
   * SAHAYAK_JWKS_URL, BIMASETU_MODE=live, BIMASETU_API_URL, COPYCAT_MODE=live once those contracts are agreed.
   */
  appEnv?: Record<string, string>;
}

const REQUIRED: Array<keyof EnvConfig> = ['account', 'region', 'apiDomain', 'appDomain', 'alertEmail'];

/** Reads context key `envs.<env>`; env comes from `-c env=prod` (default prod). */
export function loadConfig(app: App): EnvConfig {
  const envName = (app.node.tryGetContext('env') as string | undefined) ?? 'prod';
  const envs = app.node.tryGetContext('envs') as Record<string, EnvConfig> | undefined;
  const cfg = envs?.[envName];
  if (!cfg)
    throw new Error(
      `No config found in CDK context for env "${envName}" (expected envs.${envName} in cdk.json)`,
    );
  const missing = REQUIRED.filter((k) => !cfg[k] || cfg[k] === 'REPLACE_ME');
  if (missing.length)
    throw new Error(`Fill in envs.${envName}.${missing.join(', ')} in cdk.json before synth/deploy`);
  return cfg;
}
