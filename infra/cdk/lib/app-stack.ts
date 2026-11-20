import { CfnOutput, Duration, Fn, Stack, type StackProps } from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import { type Construct } from 'constructs';
import { type EnvConfig } from './config';
import { type DataStack, DB_NAME, EXTERNAL_SECRET_KEYS } from './data-stack';

export interface AppStackProps extends StackProps {
  vpc: ec2.IVpc;
  data: DataStack;
  config: EnvConfig;
  /** API image (apps/api/Dockerfile); tests pass a registry stub so jest never runs Docker. */
  apiImage: ecs.ContainerImage;
  /** Built web app (apps/web/dist); omitted in tests, so nothing is uploaded. */
  webSource?: s3deploy.ISource;
}

export const API_PORT = 4000;
const CLAMAV_PORT = 3310;
const HEALTH_PATH = '/api/v1/health';
/** Pinned ClamAV image (Docker Hub). Mirror it to ECR if Docker Hub pull limits ever bite. */
const CLAMAV_IMAGE = 'clamav/clamav:1.4';
export const METRICS_NAMESPACE = 'BimaPlacement';

export class AppStack extends Stack {
  public readonly cluster: ecs.Cluster;
  public readonly alb: elbv2.ApplicationLoadBalancer;
  public readonly apiTargetGroup: elbv2.ApplicationTargetGroup;
  public readonly apiService: ecs.FargateService;
  public readonly workerService: ecs.FargateService;
  public readonly clamavService: ecs.FargateService;
  public readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, props: AppStackProps) {
    super(scope, id, props);
    const { vpc, data, config } = props;
    const prefix = `placement-${config.envName}`;
    const firstDeploy = [true, 'true'].includes(this.node.tryGetContext('firstDeploy'));

    if (!config.hostedZoneId && !config.certificateArn)
      throw new Error(
        'Config needs either hostedZoneId (+hostedZoneName) for a DNS-validated certificate, or certificateArn',
      );
    if (config.hostedZoneId && !config.hostedZoneName)
      throw new Error('hostedZoneName is required together with hostedZoneId');
    if (config.webCertificateArn && !config.webCertificateArn.startsWith('arn:aws:acm:us-east-1:'))
      throw new Error('webCertificateArn must be an ACM certificate in us-east-1 (CloudFront)');

    const appSubnets: ec2.SubnetSelection = { subnetGroupName: 'app' };
    this.cluster = new ecs.Cluster(this, 'Cluster', {
      clusterName: prefix,
      vpc,
      containerInsightsV2: ecs.ContainerInsights.ENABLED,
      // Never log ECS Exec sessions: a secret printed in one must not land in CloudWatch.
      executeCommandConfiguration: { logging: ecs.ExecuteCommandLogging.NONE },
      defaultCloudMapNamespace: { name: 'placement.internal', vpc },
    });

    // ---------- Security groups ----------
    const sg = (name: string, description: string) =>
      new ec2.SecurityGroup(this, `${name}Sg`, {
        vpc,
        description,
        securityGroupName: `${prefix}-${name.toLowerCase()}`,
      });
    const albSg = sg('Alb', 'BimaPlacement ALB');
    albSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(80), 'HTTP (redirect)');
    albSg.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(443), 'HTTPS');
    const apiSg = sg('Api', 'BimaPlacement API tasks');
    const workerSg = sg('Worker', 'BimaPlacement worker and one-off tasks');
    const clamavSg = sg('Clamav', 'BimaPlacement ClamAV');
    // Explicit rules in this stack (avoids a Data<->App stack cycle).
    const ingress = (
      logicalId: string,
      groupId: string,
      source: ec2.SecurityGroup,
      port: number,
      description: string,
    ) =>
      new ec2.CfnSecurityGroupIngress(this, logicalId, {
        groupId,
        sourceSecurityGroupId: source.securityGroupId,
        ipProtocol: 'tcp',
        fromPort: port,
        toPort: port,
        description,
      });
    for (const [name, source] of [
      ['Api', apiSg],
      ['Worker', workerSg],
    ] as const) {
      ingress(`DbFrom${name}`, data.dbSecurityGroup.securityGroupId, source, 5432, `Postgres from ${name}`);
      ingress(
        `RedisFrom${name}`,
        data.redisSecurityGroup.securityGroupId,
        source,
        6379,
        `Redis from ${name}`,
      );
      // Uploads are scanned by the API, mail attachments by the worker (PLAN 4.5)
      clamavSg.addIngressRule(source, ec2.Port.tcp(CLAMAV_PORT), `clamd from ${name}`);
    }

    // ---------- Roles & logs ----------
    const roles = (name: string) => ({
      taskRole: new iam.Role(this, `${name}TaskRole`, {
        roleName: `${prefix}-${name}-task`,
        assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      }),
      executionRole: new iam.Role(this, `${name}ExecRole`, {
        roleName: `${prefix}-${name}-exec`,
        assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonECSTaskExecutionRolePolicy'),
        ],
      }),
    });
    const logGroup = (name: string) =>
      new logs.LogGroup(this, `${name}Logs`, {
        logGroupName: `/${prefix}/${name}`,
        retention: logs.RetentionDays.THREE_MONTHS,
      });
    const taskDef = (name: string, cpu: number, memoryLimitMiB: number) => {
      const r = roles(name);
      return new ecs.FargateTaskDefinition(this, `${name[0].toUpperCase()}${name.slice(1)}TaskDef`, {
        family: `${prefix}-${name}`,
        cpu,
        memoryLimitMiB,
        runtimePlatform: {
          cpuArchitecture: ecs.CpuArchitecture.X86_64,
          operatingSystemFamily: ecs.OperatingSystemFamily.LINUX,
        },
        ...r,
      });
    };

    // ---------- App config (shared by API, worker and the one-off migration task) ----------
    // Production defaults; config.appEnv overrides them. The API refuses to start in production with dev auth,
    // dev simulators, local storage, the dev scanner or an integration stand-in (production-checks.ts).
    const appEnv: Record<string, string> = {
      NODE_ENV: 'production',
      PORT: String(API_PORT),
      APP_BASE_URL: `https://${config.appDomain}`,
      DB_DATABASE: DB_NAME,
      DB_SSL_CA_PATH: '/app/certs/rds-global-bundle.pem',
      MESSAGING_DRIVER: 'bullmq',
      REDIS_URL: data.redisUrl,
      STORAGE_DRIVER: 's3',
      S3_BUCKET: data.documentsBucket.bucketName,
      S3_KMS_KEY_ID: data.documentsKey.keyArn,
      MALWARE_SCANNER: 'clamav',
      CLAMAV_HOST: `clamav.placement.internal`,
      CLAMAV_PORT: String(CLAMAV_PORT),
      AUTH_MODE: 'sahayak',
      FEATURE_DEV_SIMULATORS: 'false',
      // Integration stand-ins: the API refuses to start in production on them (production-checks.ts), so a
      // deploy needs appEnv with BIMASETU_MODE=live + BIMASETU_API_URL, COPYCAT_MODE=live + COPYCAT_ENDPOINT and
      // MAILBOX_DRIVER=email-layer + EMAIL_LAYER_URL once those integrations are built (HLD s11).
      BIMASETU_MODE: 'mock',
      COPYCAT_MODE: 'mock',
      MAILBOX_DRIVER: 'dev',
      SMTP_HOST: '',
      // The ALB is the one proxy in front of the API for webhooks (rate limits key on the caller's IP).
      TRUST_PROXY: '1',
      METRICS_DRIVER: 'emf',
      METRICS_NAMESPACE,
      ...config.appEnv,
    };
    const secret = ecs.Secret.fromSecretsManager;
    const appSecrets: Record<string, ecs.Secret> = {
      DB_HOST: secret(data.dbSecret, 'host'),
      DB_PORT: secret(data.dbSecret, 'port'),
      DB_USERNAME: secret(data.dbSecret, 'username'),
      DB_PASSWORD: secret(data.dbSecret, 'password'),
      ...Object.fromEntries(EXTERNAL_SECRET_KEYS.map((k) => [k, secret(data.externalSecret, k)])),
    };

    const nodeHealthCheck: ecs.HealthCheck = {
      command: [
        'CMD-SHELL',
        `node -e "require('http').get('http://localhost:${API_PORT}${HEALTH_PATH}',r=>{process.exit(r.statusCode===200?0:1)}).on('error',()=>process.exit(1))"`,
      ],
      interval: Duration.seconds(30),
      timeout: Duration.seconds(5),
      retries: 3,
      startPeriod: Duration.seconds(60),
    };

    const apiTask = taskDef('api', 1024, 2048);
    apiTask.addContainer('api', {
      image: props.apiImage,
      portMappings: [{ containerPort: API_PORT }],
      environment: appEnv,
      secrets: appSecrets,
      healthCheck: nodeHealthCheck,
      logging: ecs.LogDrivers.awsLogs({ logGroup: logGroup('api'), streamPrefix: 'api' }),
    });

    const workerTask = taskDef('worker', 1024, 2048);
    workerTask.addContainer('worker', {
      image: props.apiImage,
      command: ['node', 'dist/worker.js'],
      environment: appEnv,
      secrets: appSecrets,
      logging: ecs.LogDrivers.awsLogs({ logGroup: logGroup('worker'), streamPrefix: 'worker' }),
    });

    // Migrations + PRD master seed (idempotent). Run before each deploy: scripts in infra/cdk/README.md.
    const oneOffTask = taskDef('oneoff', 512, 1024);
    oneOffTask.addContainer('oneoff', {
      image: props.apiImage,
      command: ['npm', 'run', 'db:deploy'],
      environment: appEnv,
      secrets: appSecrets,
      logging: ecs.LogDrivers.awsLogs({ logGroup: logGroup('oneoff'), streamPrefix: 'oneoff' }),
    });

    // ClamAV: freshclam keeps signatures current; clamd needs ~2-3 GB once they are loaded.
    const clamavTask = taskDef('clamav', 1024, 4096);
    clamavTask.addContainer('clamav', {
      image: ecs.ContainerImage.fromRegistry(CLAMAV_IMAGE),
      portMappings: [{ containerPort: CLAMAV_PORT }],
      healthCheck: {
        command: ['CMD-SHELL', 'clamdcheck.sh'],
        interval: Duration.seconds(60),
        timeout: Duration.seconds(10),
        retries: 3,
        startPeriod: Duration.seconds(300),
      },
      logging: ecs.LogDrivers.awsLogs({ logGroup: logGroup('clamav'), streamPrefix: 'clamav' }),
    });

    // API and worker read/write documents (presigned downloads are signed with the API's task role).
    for (const t of [apiTask, workerTask, oneOffTask]) data.documentsBucket.grantReadWrite(t.taskRole);
    // ECS Exec on the one-off task: CDK only adds these when a service uses the task def.
    oneOffTask.taskRole.addToPrincipalPolicy(
      new iam.PolicyStatement({
        actions: [
          'ssmmessages:CreateControlChannel',
          'ssmmessages:CreateDataChannel',
          'ssmmessages:OpenControlChannel',
          'ssmmessages:OpenDataChannel',
        ],
        resources: ['*'],
      }),
    );

    // ---------- Services ----------
    const service = (
      name: string,
      taskDefinition: ecs.FargateTaskDefinition,
      desiredCount: number,
      securityGroup: ec2.SecurityGroup,
      extra: Partial<ecs.FargateServiceProps> = {},
    ) =>
      new ecs.FargateService(this, `${name[0].toUpperCase()}${name.slice(1)}Service`, {
        serviceName: `${prefix}-${name}`,
        cluster: this.cluster,
        taskDefinition,
        desiredCount: firstDeploy ? 0 : desiredCount,
        minHealthyPercent: 100,
        maxHealthyPercent: 200,
        circuitBreaker: { rollback: true },
        vpcSubnets: appSubnets,
        securityGroups: [securityGroup],
        assignPublicIp: false,
        enableExecuteCommand: true,
        ...extra,
      });
    this.apiService = service('api', apiTask, 2, apiSg, { healthCheckGracePeriod: Duration.seconds(60) });
    // One worker: repeating jobs are idempotent, but one task keeps the follow-up ladder and sweeps simple to reason
    // about. Scale on queue depth later (HLD).
    this.workerService = service('worker', workerTask, 1, workerSg);
    this.clamavService = service('clamav', clamavTask, 1, clamavSg, { cloudMapOptions: { name: 'clamav' } });

    // ---------- ALB (API host) ----------
    this.alb = new elbv2.ApplicationLoadBalancer(this, 'Alb', {
      loadBalancerName: prefix,
      vpc,
      internetFacing: true,
      vpcSubnets: { subnetGroupName: 'public' },
      securityGroup: albSg,
    });
    this.apiTargetGroup = new elbv2.ApplicationTargetGroup(this, 'ApiTg', {
      vpc,
      port: API_PORT,
      protocol: elbv2.ApplicationProtocol.HTTP,
      targetType: elbv2.TargetType.IP,
      targets: [this.apiService],
      healthCheck: { path: HEALTH_PATH },
      deregistrationDelay: Duration.seconds(30),
    });

    let zone: route53.IHostedZone | undefined;
    let certificate: acm.ICertificate;
    if (config.hostedZoneId) {
      zone = route53.HostedZone.fromHostedZoneAttributes(this, 'Zone', {
        hostedZoneId: config.hostedZoneId,
        zoneName: config.hostedZoneName!,
      });
      certificate = new acm.Certificate(this, 'Cert', {
        domainName: config.apiDomain,
        validation: acm.CertificateValidation.fromDns(zone),
      });
    } else {
      certificate = acm.Certificate.fromCertificateArn(this, 'Cert', config.certificateArn!);
    }
    this.alb.addListener('Http', {
      port: 80,
      open: false,
      defaultAction: elbv2.ListenerAction.redirect({ protocol: 'HTTPS', port: '443', permanent: true }),
    });
    const https = this.alb.addListener('Https', {
      port: 443,
      open: false,
      certificates: [certificate],
      sslPolicy: elbv2.SslPolicy.RECOMMENDED_TLS,
      defaultAction: elbv2.ListenerAction.fixedResponse(404, {
        contentType: 'text/plain',
        messageBody: 'Not found',
      }),
    });
    https.addTargetGroups('Api', {
      priority: 10,
      conditions: [elbv2.ListenerCondition.hostHeaders([config.apiDomain])],
      targetGroups: [this.apiTargetGroup],
    });

    // ---------- WAF on the ALB ----------
    const vis = (name: string) => ({
      cloudWatchMetricsEnabled: true,
      sampledRequestsEnabled: true,
      metricName: name,
    });
    const managed = (
      name: string,
      priority: number,
      overrides?: wafv2.CfnWebACL.RuleActionOverrideProperty[],
    ): wafv2.CfnWebACL.RuleProperty => ({
      name,
      priority,
      overrideAction: { none: {} },
      statement: { managedRuleGroupStatement: { vendorName: 'AWS', name, ruleActionOverrides: overrides } },
      visibilityConfig: vis(name),
    });
    const webAcl = new wafv2.CfnWebACL(this, 'WebAcl', {
      name: prefix,
      scope: 'REGIONAL',
      defaultAction: { allow: {} },
      visibilityConfig: vis(prefix),
      rules: [
        // Quote PDFs and RFQ sheets are uploaded as multipart bodies: count, never block, on body size.
        managed('AWSManagedRulesCommonRuleSet', 10, [
          { name: 'SizeRestrictions_BODY', actionToUse: { count: {} } },
        ]),
        managed('AWSManagedRulesKnownBadInputsRuleSet', 20),
        managed('AWSManagedRulesAmazonIpReputationList', 30),
        {
          name: 'RateLimitPerIp',
          priority: 40,
          action: { block: {} },
          statement: {
            rateBasedStatement: { limit: 2000, aggregateKeyType: 'IP', evaluationWindowSec: 300 },
          },
          visibilityConfig: vis('RateLimitPerIp'),
        },
      ],
    });
    new wafv2.CfnWebACLAssociation(this, 'WebAclAssoc', {
      resourceArn: this.alb.loadBalancerArn,
      webAclArn: webAcl.attrArn,
    });

    // ---------- Web app: S3 + CloudFront, /api/* forwarded to the API host ----------
    const webBucket = new s3.Bucket(this, 'WebBucket', {
      bucketName: `${prefix}-web-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
    });
    this.distribution = new cloudfront.Distribution(this, 'Web', {
      comment: `${prefix} web`,
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(webBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        responseHeadersPolicy: cloudfront.ResponseHeadersPolicy.SECURITY_HEADERS,
      },
      additionalBehaviors: {
        '/api/*': {
          origin: new origins.HttpOrigin(config.apiDomain, {
            protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
          }),
          viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        },
      },
      // Client-side routes (react-router): every unknown path serves the SPA shell.
      errorResponses: [403, 404].map((httpStatus) => ({
        httpStatus,
        responseHttpStatus: 200,
        responsePagePath: '/index.html',
        ttl: Duration.seconds(0),
      })),
      ...(config.webCertificateArn
        ? {
            domainNames: [config.appDomain],
            certificate: acm.Certificate.fromCertificateArn(this, 'WebCert', config.webCertificateArn),
          }
        : {}),
    });
    if (props.webSource)
      new s3deploy.BucketDeployment(this, 'WebDeploy', {
        sources: [props.webSource],
        destinationBucket: webBucket,
        distribution: this.distribution,
        distributionPaths: ['/*'],
      });

    if (zone) {
      new route53.ARecord(this, 'ApiRecord', {
        zone,
        recordName: config.apiDomain,
        target: route53.RecordTarget.fromAlias(new targets.LoadBalancerTarget(this.alb)),
      });
      if (config.webCertificateArn)
        new route53.ARecord(this, 'AppRecord', {
          zone,
          recordName: config.appDomain,
          target: route53.RecordTarget.fromAlias(new targets.CloudFrontTarget(this.distribution)),
        });
    }

    // ---------- Outputs (read by the deploy scripts) ----------
    new CfnOutput(this, 'ClusterName', { value: this.cluster.clusterName });
    new CfnOutput(this, 'AppSubnetIds', { value: Fn.join(',', vpc.selectSubnets(appSubnets).subnetIds) });
    new CfnOutput(this, 'WorkerSecurityGroupId', { value: workerSg.securityGroupId });
    new CfnOutput(this, 'OneOffTaskDefinitionArn', { value: oneOffTask.taskDefinitionArn });
    new CfnOutput(this, 'ApiServiceName', { value: this.apiService.serviceName });
    new CfnOutput(this, 'WorkerServiceName', { value: this.workerService.serviceName });
    new CfnOutput(this, 'AlbDnsName', { value: this.alb.loadBalancerDnsName });
    new CfnOutput(this, 'WebDistributionDomain', { value: this.distribution.distributionDomainName });
  }
}
