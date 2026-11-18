#!/usr/bin/env node
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { App, Tags } from 'aws-cdk-lib';
import { Platform } from 'aws-cdk-lib/aws-ecr-assets';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import { AppStack } from '../lib/app-stack';
import { loadConfig } from '../lib/config';
import { DataStack } from '../lib/data-stack';
import { MonitoringStack } from '../lib/monitoring-stack';
import { NetworkStack } from '../lib/network-stack';

const app = new App();
const config = loadConfig(app);
const env = { account: config.account, region: config.region };
const prefix = `Placement-${config.envName}`;
const repo = path.resolve(__dirname, '../../..');
const webDist = path.join(repo, 'apps/web/dist');

if (!existsSync(path.join(webDist, 'index.html')))
  throw new Error(
    'apps/web/dist is missing: build the web app first (NEXT_PUBLIC_AUTH_MODE=sahayak npm run build), see infra/cdk/README.md',
  );

Tags.of(app).add('project', 'bimaplacement');
Tags.of(app).add('env', config.envName);

const network = new NetworkStack(app, `${prefix}-Network`, { env });
const data = new DataStack(app, `${prefix}-Data`, { env, vpc: network.vpc, config });
const appStack = new AppStack(app, `${prefix}-App`, {
  env,
  vpc: network.vpc,
  data,
  config,
  // One image for API, worker and migrations; built from the repo root (contracts + api workspaces).
  apiImage: ecs.ContainerImage.fromAsset(repo, {
    file: 'apps/api/Dockerfile',
    platform: Platform.LINUX_AMD64,
    exclude: ['**/node_modules', '**/dist', 'apps/web', 'infra', '.git', '**/uploads'],
  }),
  webSource: s3deploy.Source.asset(webDist),
});
new MonitoringStack(app, `${prefix}-Monitoring`, { env, config, app: appStack, data });
