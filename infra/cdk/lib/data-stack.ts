import { Duration, RemovalPolicy, Stack, type StackProps } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elasticache from 'aws-cdk-lib/aws-elasticache';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as rds from 'aws-cdk-lib/aws-rds';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sm from 'aws-cdk-lib/aws-secretsmanager';
import { type Construct } from 'constructs';
import { type EnvConfig } from './config';

/** Database name; the app stack passes it as plain DB_DATABASE. */
export const DB_NAME = 'placement';

/**
 * Keys of the external-credentials secret. They must exist up front: ECS fails task start
 * (ResourceInitializationError) if a referenced JSON key is missing. Real values are set out of band.
 */
export const EXTERNAL_SECRET_KEYS = [
  'BIMASETU_API_TOKEN',
  'BIMASETU_WEBHOOK_SECRET',
  'COPYCAT_API_KEY',
  'EMAIL_LAYER_SECRET',
  'SAHAYAK_SERVICE_TOKEN',
] as const;

export interface DataStackProps extends StackProps {
  vpc: ec2.IVpc;
  config: EnvConfig;
}

export class DataStack extends Stack {
  public readonly db: rds.DatabaseInstance;
  public readonly dbSecret: sm.ISecret;
  public readonly dbSecurityGroup: ec2.SecurityGroup;
  public readonly redisSecurityGroup: ec2.SecurityGroup;
  public readonly redis: elasticache.CfnReplicationGroup;
  /** rediss:// (TLS in transit) primary endpoint for BullMQ. */
  public readonly redisUrl: string;
  public readonly redisNodeIds: string[];
  public readonly documentsKey: kms.Key;
  public readonly documentsBucket: s3.Bucket;
  public readonly externalSecret: sm.ISecret;

  constructor(scope: Construct, id: string, props: DataStackProps) {
    super(scope, id, props);
    const { vpc, config } = props;
    const prefix = `placement-${config.envName}`;

    // ---------- Postgres 16 (HLD: RDS, Multi-AZ in prod) ----------
    this.dbSecurityGroup = new ec2.SecurityGroup(this, 'DbSg', {
      vpc,
      description: 'BimaPlacement Postgres access',
      allowAllOutbound: false,
    });
    const engine = rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_16 });
    this.db = new rds.DatabaseInstance(this, 'Db', {
      engine,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MEDIUM),
      vpc,
      vpcSubnets: { subnetGroupName: 'db' },
      securityGroups: [this.dbSecurityGroup],
      publiclyAccessible: false,
      multiAz: config.multiAz,
      storageType: rds.StorageType.GP3,
      allocatedStorage: 20,
      maxAllocatedStorage: 200,
      storageEncrypted: true,
      backupRetention: Duration.days(14),
      deletionProtection: true,
      removalPolicy: RemovalPolicy.RETAIN,
      enablePerformanceInsights: true,
      parameterGroup: new rds.ParameterGroup(this, 'DbParams', {
        engine,
        parameters: { 'rds.force_ssl': '1' },
      }),
      databaseName: DB_NAME,
      credentials: rds.Credentials.fromGeneratedSecret('placement', { secretName: `${prefix}/db` }),
    });
    this.dbSecret = this.db.secret!;
    // db.secret is the attachment; the CfnSecret lives in the child 'Secret' construct.
    (this.db.node.findChild('Secret') as sm.Secret).applyRemovalPolicy(RemovalPolicy.RETAIN);

    // ---------- Redis 7 for BullMQ queues and timers ----------
    this.redisSecurityGroup = new ec2.SecurityGroup(this, 'RedisSg', {
      vpc,
      description: 'BimaPlacement Redis access',
      allowAllOutbound: false,
    });
    const subnets = new elasticache.CfnSubnetGroup(this, 'RedisSubnets', {
      description: 'BimaPlacement Redis',
      subnetIds: vpc.selectSubnets({ subnetGroupName: 'db' }).subnetIds,
    });
    // BullMQ needs noeviction: an evicted key silently loses jobs and timers.
    const params = new elasticache.CfnParameterGroup(this, 'RedisParams', {
      cacheParameterGroupFamily: 'redis7',
      description: 'BimaPlacement BullMQ (noeviction)',
      properties: { 'maxmemory-policy': 'noeviction' },
    });
    const nodes = config.multiAz ? 2 : 1;
    this.redis = new elasticache.CfnReplicationGroup(this, 'Redis', {
      replicationGroupDescription: 'BimaPlacement BullMQ',
      replicationGroupId: `${prefix}-redis`,
      engine: 'redis',
      engineVersion: '7.1',
      cacheNodeType: 'cache.t4g.small',
      numCacheClusters: nodes,
      automaticFailoverEnabled: config.multiAz,
      multiAzEnabled: config.multiAz,
      cacheSubnetGroupName: subnets.ref,
      cacheParameterGroupName: params.ref,
      securityGroupIds: [this.redisSecurityGroup.securityGroupId],
      transitEncryptionEnabled: true,
      atRestEncryptionEnabled: true,
      snapshotRetentionLimit: 3,
    });
    this.redisUrl = `rediss://${this.redis.attrPrimaryEndPointAddress}:${this.redis.attrPrimaryEndPointPort}`;
    this.redisNodeIds = Array.from({ length: nodes }, (_, i) => `${prefix}-redis-00${i + 1}`);

    // ---------- Documents: RFQs, quotes, QCRs (SSE-KMS, versioned, object lock ready for IRDAI retention) ----------
    this.documentsKey = new kms.Key(this, 'DocumentsKey', {
      alias: `${prefix}-documents`,
      enableKeyRotation: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    this.documentsBucket = new s3.Bucket(this, 'DocumentsBucket', {
      bucketName: `${prefix}-documents-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: this.documentsKey,
      bucketKeyEnabled: true,
      enforceSSL: true,
      versioned: true,
      // Object lock can only be switched on at creation. Default retention waits for the DPDP / IRDAI periods.
      objectLockEnabled: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // ---------- External credentials (placeholders; real values set out of band, never in code) ----------
    this.externalSecret = new sm.Secret(this, 'ExternalSecret', {
      secretName: `${prefix}/external`,
      removalPolicy: RemovalPolicy.RETAIN,
      generateSecretString: {
        secretStringTemplate: JSON.stringify(Object.fromEntries(EXTERNAL_SECRET_KEYS.map((k) => [k, '']))),
        generateStringKey: 'placeholder',
      },
    });
  }
}
