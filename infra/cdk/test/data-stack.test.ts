import { Match } from 'aws-cdk-lib/assertions';
import { buildStacks } from './helpers';

describe('DataStack', () => {
  const { data } = buildStacks();

  test('Postgres 16 is private, encrypted, Multi-AZ, retained and forces TLS', () => {
    data.hasResourceProperties('AWS::RDS::DBInstance', {
      Engine: 'postgres',
      EngineVersion: Match.stringLikeRegexp('^16'),
      PubliclyAccessible: false,
      MultiAZ: true,
      StorageEncrypted: true,
      DeletionProtection: true,
      DBName: 'placement',
    });
    data.hasResource('AWS::RDS::DBInstance', { DeletionPolicy: 'Retain' });
    data.hasResourceProperties('AWS::RDS::DBParameterGroup', { Parameters: { 'rds.force_ssl': '1' } });
  });

  test('Redis is encrypted in transit and never evicts BullMQ keys', () => {
    data.hasResourceProperties('AWS::ElastiCache::ReplicationGroup', {
      TransitEncryptionEnabled: true,
      AtRestEncryptionEnabled: true,
      NumCacheClusters: 2,
      AutomaticFailoverEnabled: true,
    });
    data.hasResourceProperties('AWS::ElastiCache::ParameterGroup', {
      CacheParameterGroupFamily: 'redis7',
      Properties: { 'maxmemory-policy': 'noeviction' },
    });
  });

  test('documents bucket is KMS-encrypted, versioned, object-lock ready, private and retained', () => {
    data.hasResourceProperties('AWS::S3::Bucket', {
      ObjectLockEnabled: true,
      VersioningConfiguration: { Status: 'Enabled' },
      BucketEncryption: {
        ServerSideEncryptionConfiguration: [
          Match.objectLike({ ServerSideEncryptionByDefault: Match.objectLike({ SSEAlgorithm: 'aws:kms' }) }),
        ],
      },
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
    data.hasResource('AWS::S3::Bucket', { DeletionPolicy: 'Retain' });
    data.hasResourceProperties('AWS::KMS::Key', { EnableKeyRotation: true });
  });

  test('external credentials secret has every key the tasks reference, no values', () => {
    data.hasResourceProperties('AWS::SecretsManager::Secret', {
      Name: 'placement-prod/external',
      GenerateSecretString: Match.objectLike({
        SecretStringTemplate: JSON.stringify({
          BIMASETU_API_TOKEN: '',
          BIMASETU_WEBHOOK_SECRET: '',
          COPYCAT_API_KEY: '',
          EMAIL_LAYER_SECRET: '',
          SAHAYAK_SERVICE_TOKEN: '',
        }),
      }),
    });
  });
});
