import { Match, type Template } from 'aws-cdk-lib/assertions';
import { buildStacks, testConfig } from './helpers';

type Container = {
  Name: string;
  Command?: string[];
  Environment?: Array<{ Name: string; Value: unknown }>;
  Secrets?: Array<{ Name: string }>;
};

const container = (t: Template, family: string): Container => {
  const def = Object.values(t.findResources('AWS::ECS::TaskDefinition')).find(
    (r) => (r as { Properties: { Family: string } }).Properties.Family === family,
  ) as { Properties: { ContainerDefinitions: Container[] } } | undefined;
  if (!def) throw new Error(`no task definition ${family}`);
  return def.Properties.ContainerDefinitions[0];
};
const env = (c: Container) => Object.fromEntries((c.Environment ?? []).map((e) => [e.Name, e.Value]));

describe('AppStack', () => {
  const { app } = buildStacks();

  test('API, worker and migrations run the same image with production-grade settings', () => {
    const api = env(container(app, 'placement-prod-api'));
    expect(api).toMatchObject({
      NODE_ENV: 'production',
      AUTH_MODE: 'sahayak',
      FEATURE_DEV_SIMULATORS: 'false',
      STORAGE_DRIVER: 's3',
      MALWARE_SCANNER: 'clamav',
      CLAMAV_HOST: 'clamav.placement.internal',
      DB_SSL_CA_PATH: '/app/certs/rds-global-bundle.pem',
      METRICS_DRIVER: 'emf',
      TRUST_PROXY: '1',
    });
    expect(container(app, 'placement-prod-worker').Command).toEqual(['node', 'dist/worker.js']);
    expect(container(app, 'placement-prod-oneoff').Command).toEqual(['npm', 'run', 'db:deploy']);
  });

  test('credentials only arrive as secrets, never as plain environment', () => {
    for (const family of ['placement-prod-api', 'placement-prod-worker', 'placement-prod-oneoff']) {
      const c = container(app, family);
      const plain = (c.Environment ?? []).map((e) => e.Name);
      const secrets = (c.Secrets ?? []).map((s) => s.Name);
      for (const name of [
        'DB_PASSWORD',
        'BIMASETU_WEBHOOK_SECRET',
        'COPYCAT_API_KEY',
        'EMAIL_LAYER_SECRET',
        'SAHAYAK_SERVICE_TOKEN',
      ]) {
        expect(plain).not.toContain(name);
        expect(secrets).toContain(name);
      }
    }
  });

  test('appEnv overrides the defaults (integrations go live by config)', () => {
    const { app: t } = buildStacks({
      ...testConfig,
      appEnv: { BIMASETU_MODE: 'live', COPYCAT_MODE: 'live' },
    });
    expect(env(container(t, 'placement-prod-api'))).toMatchObject({
      BIMASETU_MODE: 'live',
      COPYCAT_MODE: 'live',
    });
  });

  test('services: 2 API tasks, 1 worker, ClamAV discoverable, rollback on failed deploys', () => {
    app.hasResourceProperties('AWS::ECS::Service', {
      ServiceName: 'placement-prod-api',
      DesiredCount: 2,
      DeploymentConfiguration: Match.objectLike({
        DeploymentCircuitBreaker: { Enable: true, Rollback: true },
      }),
    });
    app.hasResourceProperties('AWS::ECS::Service', { ServiceName: 'placement-prod-worker', DesiredCount: 1 });
    app.hasResourceProperties('AWS::ECS::Service', {
      ServiceName: 'placement-prod-clamav',
      ServiceRegistries: Match.anyValue(),
    });
    app.hasResourceProperties('AWS::ECS::Cluster', {
      Configuration: { ExecuteCommandConfiguration: { Logging: 'NONE' } },
    });
  });

  test('firstDeploy starts every service at zero tasks (secrets and migrations first)', () => {
    const { app: t } = buildStacks(testConfig, { firstDeploy: 'true' });
    const counts = Object.values(t.findResources('AWS::ECS::Service')).map(
      (r) => (r as { Properties: { DesiredCount: number } }).Properties.DesiredCount,
    );
    expect(counts).toEqual([0, 0, 0]);
  });

  test('ALB serves only the API host over TLS, behind a WAF', () => {
    app.hasResourceProperties('AWS::ElasticLoadBalancingV2::Listener', {
      Port: 80,
      DefaultActions: [Match.objectLike({ Type: 'redirect' })],
    });
    app.hasResourceProperties('AWS::ElasticLoadBalancingV2::ListenerRule', {
      Conditions: [
        Match.objectLike({ Field: 'host-header', HostHeaderConfig: { Values: [testConfig.apiDomain] } }),
      ],
    });
    app.hasResourceProperties('AWS::ElasticLoadBalancingV2::TargetGroup', {
      HealthCheckPath: '/api/v1/health',
    });
    app.resourceCountIs('AWS::WAFv2::WebACLAssociation', 1);
  });

  test('web app: private bucket behind CloudFront, /api/* uncached to the API host, SPA fallback', () => {
    app.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: Match.objectLike({
        DefaultRootObject: 'index.html',
        CacheBehaviors: [
          Match.objectLike({ PathPattern: '/api/*', AllowedMethods: Match.arrayWith(['POST']) }),
        ],
        CustomErrorResponses: Match.arrayWith([
          Match.objectLike({ ErrorCode: 404, ResponseCode: 200, ResponsePagePath: '/index.html' }),
        ]),
      }),
    });
    app.resourceCountIs('AWS::CloudFront::OriginAccessControl', 1);
  });

  test('refuses a CloudFront certificate outside us-east-1', () => {
    expect(() =>
      buildStacks({ ...testConfig, webCertificateArn: 'arn:aws:acm:ap-south-1:111111111111:certificate/x' }),
    ).toThrow(/us-east-1/);
  });
});
