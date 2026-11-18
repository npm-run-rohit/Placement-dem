import { App, Tags } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import { AppStack } from '../lib/app-stack';
import { type EnvConfig } from '../lib/config';
import { DataStack } from '../lib/data-stack';
import { MonitoringStack } from '../lib/monitoring-stack';
import { NetworkStack } from '../lib/network-stack';

// TEST FIXTURE - not a real account or domain
export const testConfig: EnvConfig = {
  envName: 'prod',
  account: '111111111111',
  region: 'ap-south-1',
  apiDomain: 'placement-api.example.test',
  appDomain: 'placement.example.test',
  hostedZoneId: 'Z123',
  hostedZoneName: 'example.test',
  alertEmail: 'alerts@example.test',
  multiAz: true,
};

export const stackEnv = { account: testConfig.account, region: testConfig.region };

/** All four stacks with a registry stub image, so jest never runs Docker. */
export function buildStacks(config: EnvConfig = testConfig, context: Record<string, string> = {}) {
  const app = new App({ context });
  Tags.of(app).add('project', 'bimaplacement');
  const network = new NetworkStack(app, 'Placement-prod-Network', { env: stackEnv });
  const data = new DataStack(app, 'Placement-prod-Data', { env: stackEnv, vpc: network.vpc, config });
  const appStack = new AppStack(app, 'Placement-prod-App', {
    env: stackEnv,
    vpc: network.vpc,
    data,
    config,
    apiImage: ecs.ContainerImage.fromRegistry('public.ecr.aws/docker/library/node:20-alpine'),
  });
  const monitoring = new MonitoringStack(app, 'Placement-prod-Monitoring', {
    env: stackEnv,
    config,
    app: appStack,
    data,
  });
  return {
    network: Template.fromStack(network),
    data: Template.fromStack(data),
    app: Template.fromStack(appStack),
    monitoring: Template.fromStack(monitoring),
  };
}
