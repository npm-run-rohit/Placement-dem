import { databaseUrl } from './database-url';
import { productionProblems } from './production-checks';
/**
 * Typed configuration. Read through ConfigService<AppConfig, true>.
 * Secrets come from AWS Secrets Manager in staging/prod (injected as env by ECS task definition).
 */
export interface AppConfig {
  env: 'development' | 'test' | 'staging' | 'production';
  port: number;
  apiPrefix: string;
  appBaseUrl: string;
  database: { url: string; logQueries: boolean; sslCaPath?: string };
  messaging: {
    driver: 'bullmq' | 'aws';
    redisUrl: string;
    aws: { region: string; eventBusName: string; sqsQueuePrefix: string };
  };
  storage: { driver: 'local' | 's3'; localDir: string; s3Bucket: string; kmsKeyId?: string };
  auth: { mode: 'dev' | 'sahayak'; issuer: string; audience: string; jwksUrl: string };
  sahayak: { apiUrl: string; serviceToken: string; notificationsEnabled: boolean };
  bimasetu: {
    mode: 'mock' | 'live';
    apiUrl: string;
    apiToken: string;
    webhookSecret: string;
    webhookToleranceSeconds: number;
    pollingFallback: boolean;
  };
  copycat: {
    mode: 'mock' | 'live';
    endpoint: string;
    apiKey: string;
    timeoutMs: number;
    mockDelayMs: number;
  };
  mailbox: {
    driver: 'dev' | 'gmail' | 'graph' | 'email-layer';
    smtpHost: string;
    smtpPort: number;
    /** Shared email layer (docs/integration/EMAIL-LAYER-CONTRACT.md); used when driver = email-layer. */
    emailLayer: { url: string; secret: string; webhookToleranceSeconds: number };
  };
  features: { devSimulators: boolean };
  /** PLAN 4.5: every stored file is scanned; `dev` only flags the EICAR test file and is refused in production. */
  malware: { driver: 'dev' | 'clamav'; clamavHost: string; clamavPort: number; timeoutMs: number };
  /** PLAN 4.5: requests per minute on the public webhook, per source IP. */
  rateLimits: { webhookPerMinute: number };
  /** PLAN 4.6: ops metrics from the worker; `emf` writes CloudWatch Embedded Metric Format lines to stdout. */
  metrics: { driver: 'off' | 'emf'; namespace: string };
}

const bool = (v: string | undefined, d = false) =>
  v === undefined ? d : ['1', 'true', 'yes'].includes(v.toLowerCase());
const num = (v: string | undefined, d: number) => (v ? Number(v) : d);

export default (): AppConfig => {
  const config = load(process.env);
  const problems = config.env === 'production' ? productionProblems(config) : [];
  if (problems.length) throw new Error(`Refusing to start in production:\n- ${problems.join('\n- ')}`);
  return config;
};

function load(e: NodeJS.ProcessEnv): AppConfig {
  return {
    env: (e.NODE_ENV as AppConfig['env']) ?? 'development',
    port: num(e.PORT, 4000),
    apiPrefix: e.API_PREFIX ?? 'api/v1',
    appBaseUrl: e.APP_BASE_URL ?? 'http://localhost:5173',
    database: {
      url: databaseUrl(e),
      logQueries: bool(e.DB_LOG_QUERIES),
      sslCaPath: e.DB_SSL_CA_PATH || undefined,
    },
    messaging: {
      driver: (e.MESSAGING_DRIVER as 'bullmq' | 'aws') ?? 'bullmq',
      redisUrl: e.REDIS_URL ?? 'redis://localhost:6379',
      aws: {
        region: e.AWS_REGION ?? 'ap-south-1',
        eventBusName: e.AWS_EVENT_BUS_NAME ?? 'bimasahayak-bus',
        sqsQueuePrefix: e.AWS_SQS_QUEUE_PREFIX ?? 'placement-',
      },
    },
    storage: {
      driver: (e.STORAGE_DRIVER as 'local' | 's3') ?? 'local',
      localDir: e.STORAGE_LOCAL_DIR ?? './uploads',
      s3Bucket: e.S3_BUCKET ?? '',
      kmsKeyId: e.S3_KMS_KEY_ID || undefined,
    },
    auth: {
      mode: (e.AUTH_MODE as 'dev' | 'sahayak') ?? 'dev',
      issuer: e.SAHAYAK_ISSUER ?? '',
      audience: e.SAHAYAK_AUDIENCE ?? 'bimaplacement',
      jwksUrl: e.SAHAYAK_JWKS_URL ?? '',
    },
    sahayak: {
      apiUrl: e.SAHAYAK_API_URL ?? '',
      serviceToken: e.SAHAYAK_SERVICE_TOKEN ?? '',
      notificationsEnabled: bool(e.SAHAYAK_NOTIFICATIONS_ENABLED),
    },
    bimasetu: {
      mode: (e.BIMASETU_MODE as 'mock' | 'live') ?? 'mock',
      apiUrl: e.BIMASETU_API_URL ?? '',
      apiToken: e.BIMASETU_API_TOKEN ?? '',
      webhookSecret: e.BIMASETU_WEBHOOK_SECRET ?? '',
      webhookToleranceSeconds: num(e.BIMASETU_WEBHOOK_TOLERANCE_SECONDS, 300),
      pollingFallback: bool(e.BIMASETU_POLLING_FALLBACK),
    },
    copycat: {
      mode: (e.COPYCAT_MODE as 'mock' | 'live') ?? 'mock',
      endpoint: e.COPYCAT_ENDPOINT ?? '',
      apiKey: e.COPYCAT_API_KEY ?? '',
      timeoutMs: num(e.COPYCAT_TIMEOUT_MS, 60000),
      mockDelayMs: num(e.COPYCAT_MOCK_DELAY_MS, 2500),
    },
    mailbox: {
      driver: (e.MAILBOX_DRIVER as 'dev' | 'gmail' | 'graph' | 'email-layer') ?? 'dev',
      smtpHost: e.SMTP_HOST ?? 'localhost',
      smtpPort: num(e.SMTP_PORT, 1025),
      emailLayer: {
        url: e.EMAIL_LAYER_URL ?? '',
        secret: e.EMAIL_LAYER_SECRET ?? '',
        webhookToleranceSeconds: num(e.EMAIL_LAYER_TOLERANCE_SECONDS, 300),
      },
    },
    features: { devSimulators: bool(e.FEATURE_DEV_SIMULATORS, true) },
    malware: {
      driver: (e.MALWARE_SCANNER as 'dev' | 'clamav') ?? 'dev',
      clamavHost: e.CLAMAV_HOST ?? 'localhost',
      clamavPort: num(e.CLAMAV_PORT, 3310),
      timeoutMs: num(e.MALWARE_SCAN_TIMEOUT_MS, 30000),
    },
    rateLimits: { webhookPerMinute: num(e.WEBHOOK_RATE_LIMIT_PER_MIN, 300) },
    metrics: {
      driver: (e.METRICS_DRIVER as 'off' | 'emf') ?? 'off',
      namespace: e.METRICS_NAMESPACE ?? 'BimaPlacement',
    },
  };
}
