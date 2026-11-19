import { Match } from 'aws-cdk-lib/assertions';
import { buildStacks } from './helpers';

describe('MonitoringStack', () => {
  const { monitoring } = buildStacks();
  const alarms = Object.values(monitoring.findResources('AWS::CloudWatch::Alarm')).map(
    (r) =>
      (
        r as {
          Properties: {
            AlarmName: string;
            AlarmDescription: string;
            MetricName?: string;
            Namespace?: string;
            TreatMissingData: string;
          };
        }
      ).Properties,
  );
  const alarm = (name: string) => {
    const a = alarms.find((x) => x.AlarmName === `placement-prod-${name}`);
    if (!a) throw new Error(`no alarm ${name}`);
    return a;
  };

  test('PLAN 4.6 alarms exist on the app metrics the worker publishes', () => {
    expect(alarm('sla-engine-stalled')).toMatchObject({
      MetricName: 'HeartbeatAgeSeconds',
      Namespace: 'BimaPlacement',
    });
    expect(alarm('outbox-lag')).toMatchObject({ MetricName: 'OutboxLagSeconds' });
    expect(alarm('dead-letter-jobs')).toMatchObject({ MetricName: 'FailedJobsTotal' });
    expect(alarm('unmatched-mail-backlog')).toMatchObject({ MetricName: 'UnmatchedMailPending' });
    expect(alarm('copycat-failures')).toMatchObject({ MetricName: 'CopycatFailures15m' });
    expect(alarm('mail-send-failures')).toMatchObject({ MetricName: 'FailedJobs' });
    expect(alarm('mail-not-sent')).toMatchObject({ MetricName: 'MailNotSent1h' });
    expect(alarm('mail-not-sent').AlarmDescription).toMatch(/mail-send-failures\.md$/);
    expect(alarm('sla-engine-errors')).toMatchObject({ MetricName: 'JobErrors' });
    expect(alarm('email-layer-inbound-failing')).toMatchObject({ MetricName: 'EmailLayerInboundFailed1h' });
  });

  test('silence counts as trouble where it means a stopped worker or service', () => {
    for (const name of [
      'sla-engine-stalled',
      'outbox-relay-stalled',
      'worker-down',
      'clamav-down',
      'api-no-healthy-hosts',
    ])
      expect(alarm(name).TreatMissingData).toBe('breaching');
    expect(alarm('copycat-failures').TreatMissingData).toBe('notBreaching');
  });

  test('every alarm links its runbook, and every runbook exists', () => {
    const fs = jest.requireActual('node:fs') as typeof import('node:fs');
    const path = jest.requireActual('node:path') as typeof import('node:path');
    for (const a of alarms) {
      const m = a.AlarmDescription.match(/docs\/runbooks\/([a-z0-9-]+)\.md$/);
      expect(m).not.toBeNull();
      expect(fs.existsSync(path.resolve(__dirname, '../../../docs/runbooks', `${m![1]}.md`))).toBe(true);
    }
  });

  test('alarms and recoveries go to the alert topic by email', () => {
    monitoring.hasResourceProperties('AWS::SNS::Subscription', {
      Protocol: 'email',
      Endpoint: 'alerts@example.test',
    });
    monitoring.hasResourceProperties('AWS::CloudWatch::Alarm', {
      AlarmActions: [Match.anyValue()],
      OKActions: [Match.anyValue()],
    });
    monitoring.resourceCountIs('AWS::CloudWatch::Dashboard', 1);
  });

  test('one Redis memory alarm per node', () => {
    expect(alarms.filter((a) => a.AlarmName.startsWith('placement-prod-redis-memory'))).toHaveLength(2);
  });
});
