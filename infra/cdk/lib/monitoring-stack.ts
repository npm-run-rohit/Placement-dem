import { Duration, Stack, type StackProps } from 'aws-cdk-lib';
import * as cw from 'aws-cdk-lib/aws-cloudwatch';
import * as cwActions from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as subs from 'aws-cdk-lib/aws-sns-subscriptions';
import { type Construct } from 'constructs';
import { type AppStack, METRICS_NAMESPACE } from './app-stack';
import { type EnvConfig } from './config';
import { type DataStack } from './data-stack';

export interface MonitoringStackProps extends StackProps {
  config: EnvConfig;
  app: AppStack;
  data: DataStack;
}

/** Link base for alarm descriptions; runbooks live in the repo (docs/runbooks). */
const RUNBOOKS = 'https://github.com/bimakavach/Placement/blob/main/docs/runbooks';

interface AlarmSpec {
  id: string;
  /** Runbook file name without .md; also the alarm name suffix. */
  runbook: string;
  summary: string;
  metric: cw.IMetric;
  threshold: number;
  comparison: cw.ComparisonOperator;
  evaluationPeriods?: number;
  /** BREACHING when silence itself means trouble (worker or service down). */
  missing?: cw.TreatMissingData;
}

const GTE = cw.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD;
const GT = cw.ComparisonOperator.GREATER_THAN_THRESHOLD;
const LT = cw.ComparisonOperator.LESS_THAN_THRESHOLD;

/**
 * PLAN 4.6: alarms + dashboard. Infrastructure metrics come from AWS; the app's own metrics (outbox lag, dead
 * letters, stalled jobs, review backlog, Copycat / BimaSetu failures) are published every minute by the worker's
 * ops-metrics job as EMF log lines. Every alarm names its runbook.
 */
export class MonitoringStack extends Stack {
  public readonly topic: sns.Topic;
  public readonly alarms: cw.Alarm[] = [];

  constructor(scope: Construct, id: string, props: MonitoringStackProps) {
    super(scope, id, props);
    const { config, app, data } = props;
    const prefix = `placement-${config.envName}`;

    this.topic = new sns.Topic(this, 'AlertTopic', { topicName: `${prefix}-alerts` });
    this.topic.addSubscription(new subs.EmailSubscription(config.alertEmail));
    const action = new cwActions.SnsAction(this.topic);

    const five = Duration.minutes(5);
    const appMetric = (metricName: string, dimensionsMap?: Record<string, string>, period = five) =>
      new cw.Metric({
        namespace: METRICS_NAMESPACE,
        metricName,
        dimensionsMap,
        statistic: 'Maximum',
        period,
      });
    const serviceTasks = (serviceName: string) =>
      new cw.Metric({
        namespace: 'ECS/ContainerInsights',
        metricName: 'RunningTaskCount',
        dimensionsMap: { ClusterName: app.cluster.clusterName, ServiceName: serviceName },
        statistic: 'Minimum',
        period: five,
      });
    const redisMemory = (nodeId: string) =>
      new cw.Metric({
        namespace: 'AWS/ElastiCache',
        metricName: 'DatabaseMemoryUsagePercentage',
        dimensionsMap: { CacheClusterId: nodeId },
        statistic: 'Maximum',
        period: five,
      });

    const specs: AlarmSpec[] = [
      // ---- App (published by the worker's ops-metrics job) ----
      {
        id: 'SlaEngineStalled',
        runbook: 'sla-engine-stalled',
        summary: 'The SLA sweep has not completed for 5+ minutes: no follow-ups, no SLA-P1 escalations',
        metric: appMetric('HeartbeatAgeSeconds', { Job: 'sla-sweep' }),
        threshold: 300,
        comparison: GT,
        missing: cw.TreatMissingData.BREACHING,
      },
      {
        id: 'SlaEngineErrors',
        runbook: 'sla-engine-errors',
        summary: 'SLA sweeps keep failing on some tickets or threads',
        metric: appMetric('JobErrors', { Job: 'sla-sweep' }),
        threshold: 1,
        comparison: GTE,
        evaluationPeriods: 3,
      },
      {
        id: 'OutboxRelayStalled',
        runbook: 'outbox-lag',
        summary:
          'The outbox relay has not run for 2+ minutes: no mail, BimaSetu messages or notifications go out',
        metric: appMetric('HeartbeatAgeSeconds', { Job: 'outbox-relay' }),
        threshold: 120,
        comparison: GT,
        missing: cw.TreatMissingData.BREACHING,
      },
      {
        id: 'OutboxLag',
        runbook: 'outbox-lag',
        summary: 'An outbox event has waited 5+ minutes to be relayed',
        metric: appMetric('OutboxLagSeconds'),
        threshold: 300,
        comparison: GT,
      },
      {
        id: 'OutboxFailing',
        runbook: 'outbox-lag',
        summary: 'Outbox events keep failing to relay',
        metric: appMetric('OutboxFailing'),
        threshold: 1,
        comparison: GTE,
        evaluationPeriods: 2,
      },
      {
        id: 'DeadLetterJobs',
        runbook: 'dead-letter-jobs',
        summary: 'Queue jobs used up their retries (dead-lettered)',
        metric: appMetric('FailedJobsTotal'),
        threshold: 1,
        comparison: GTE,
      },
      {
        id: 'MailSendFailures',
        runbook: 'mail-send-failures',
        summary: 'Insurer / RM mail failed to send after retries (mailbox connector)',
        metric: appMetric('FailedJobs', { Queue: 'mail-outbound' }),
        threshold: 1,
        comparison: GTE,
      },
      {
        id: 'MailNotSent',
        runbook: 'mail-send-failures',
        summary: 'Insurer / RM mail was not sent: the PM mailbox is not connected, or Gmail refused the mail',
        metric: appMetric('MailNotSent1h'),
        threshold: 1,
        comparison: GTE,
      },
      {
        id: 'UnmatchedMailBacklog',
        runbook: 'unmatched-mail-backlog',
        summary: '25+ inbound mails waiting in the Unmatched queue for an hour',
        metric: appMetric('UnmatchedMailPending', undefined, Duration.minutes(15)),
        threshold: 25,
        comparison: GTE,
        evaluationPeriods: 4,
      },
      {
        id: 'CopycatFailures',
        runbook: 'copycat-failures',
        summary: '3+ Copycat QCR generations failed in 15 minutes',
        metric: appMetric('CopycatFailures15m'),
        threshold: 3,
        comparison: GTE,
      },
      {
        id: 'BimaSetuInboundRetrying',
        runbook: 'bimasetu-inbound',
        summary: 'BimaSetu messages have been failing and retrying for 15+ minutes',
        metric: appMetric('BimaSetuInboundRetrying'),
        threshold: 1,
        comparison: GTE,
        evaluationPeriods: 3,
      },
      {
        id: 'BimaSetuInboundRejected',
        runbook: 'bimasetu-inbound',
        summary: '5+ BimaSetu messages refused in the last hour (contract drift?)',
        metric: appMetric('BimaSetuInboundRejected1h'),
        threshold: 5,
        comparison: GTE,
      },
      {
        id: 'EmailLayerInboundFailing',
        runbook: 'email-layer-inbound',
        summary:
          '3+ email layer deliveries failed in the last hour (attachment URLs or database); replies are not arriving',
        metric: appMetric('EmailLayerInboundFailed1h'),
        threshold: 3,
        comparison: GTE,
      },
      // ---- Services ----
      {
        id: 'ApiNoHealthyHosts',
        runbook: 'api-down',
        summary: 'No healthy API tasks behind the load balancer',
        metric: app.apiTargetGroup.metrics.healthyHostCount({ period: five, statistic: 'Minimum' }),
        threshold: 1,
        comparison: LT,
        missing: cw.TreatMissingData.BREACHING,
      },
      {
        id: 'ApiTarget5xx',
        runbook: 'api-errors',
        summary: '10+ API 5xx responses in 5 minutes',
        metric: app.alb.metrics.httpCodeTarget(elbv2.HttpCodeTarget.TARGET_5XX_COUNT, {
          period: five,
          statistic: 'Sum',
        }),
        threshold: 10,
        comparison: GTE,
      },
      {
        id: 'AlbElb5xx',
        runbook: 'api-errors',
        summary: '10+ load balancer 5xx responses in 5 minutes',
        metric: app.alb.metrics.httpCodeElb(elbv2.HttpCodeElb.ELB_5XX_COUNT, {
          period: five,
          statistic: 'Sum',
        }),
        threshold: 10,
        comparison: GTE,
      },
      {
        id: 'WorkerDown',
        runbook: 'worker-down',
        summary: 'No worker task running: queues, timers and the SLA engine are stopped',
        metric: serviceTasks(app.workerService.serviceName),
        threshold: 1,
        comparison: LT,
        missing: cw.TreatMissingData.BREACHING,
      },
      {
        id: 'ClamavDown',
        runbook: 'clamav-down',
        summary: 'No ClamAV task running: every upload and mail attachment is refused',
        metric: serviceTasks(app.clamavService.serviceName),
        threshold: 1,
        comparison: LT,
        missing: cw.TreatMissingData.BREACHING,
      },
      // ---- Data ----
      {
        id: 'RdsCpu',
        runbook: 'database',
        summary: 'Postgres CPU above 80% for 15 minutes',
        metric: data.db.metricCPUUtilization({ period: five, statistic: 'Average' }),
        threshold: 80,
        comparison: GT,
        evaluationPeriods: 3,
      },
      {
        id: 'RdsFreeStorage',
        runbook: 'database',
        summary: 'Postgres free storage below 5 GB',
        metric: data.db.metricFreeStorageSpace({ period: five, statistic: 'Minimum' }),
        threshold: 5 * 1024 ** 3,
        comparison: LT,
      },
      {
        id: 'RdsConnections',
        runbook: 'database',
        summary: 'Postgres connections above 80',
        metric: data.db.metricDatabaseConnections({ period: five, statistic: 'Maximum' }),
        threshold: 80,
        comparison: GT,
      },
      ...data.redisNodeIds.map((nodeId, i): AlarmSpec => ({
        id: `RedisMemory${i + 1}`,
        runbook: 'redis',
        summary: `Redis node ${nodeId} memory above 80% (noeviction: writes fail when full)`,
        metric: redisMemory(nodeId),
        threshold: 80,
        comparison: GT,
      })),
    ];

    for (const s of specs) {
      const alarm = new cw.Alarm(this, `${s.id}Alarm`, {
        alarmName: `${prefix}-${s.id.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()}`,
        alarmDescription: `${s.summary}. Runbook: ${RUNBOOKS}/${s.runbook}.md`,
        metric: s.metric,
        threshold: s.threshold,
        comparisonOperator: s.comparison,
        evaluationPeriods: s.evaluationPeriods ?? 1,
        treatMissingData: s.missing ?? cw.TreatMissingData.NOT_BREACHING,
      });
      alarm.addAlarmAction(action);
      alarm.addOkAction(action);
      this.alarms.push(alarm);
    }

    // ---------- Dashboard ----------
    const graph = (title: string, metrics: cw.IMetric[], width = 8) =>
      new cw.GraphWidget({ title, left: metrics, width, height: 6 });
    const queues = [
      'mail-outbound',
      'bimasetu-inbound',
      'bimasetu-outbound',
      'copycat-runner',
      'notifications',
      'outbox-relay',
      'sla-sweep',
      'mail-inbound',
    ];
    new cw.Dashboard(this, 'Dashboard', {
      dashboardName: prefix,
      widgets: [
        [new cw.AlarmStatusWidget({ title: 'Alarms', alarms: this.alarms, width: 24, height: 4 })],
        [
          graph('Job heartbeat age (s)', [
            appMetric('HeartbeatAgeSeconds', { Job: 'sla-sweep' }, Duration.minutes(1)),
            appMetric('HeartbeatAgeSeconds', { Job: 'outbox-relay' }, Duration.minutes(1)),
          ]),
          graph('Outbox', [
            appMetric('OutboxLagSeconds', undefined, Duration.minutes(1)),
            appMetric('OutboxPending', undefined, Duration.minutes(1)),
            appMetric('OutboxFailing', undefined, Duration.minutes(1)),
          ]),
          graph(
            'Dead-lettered jobs by queue',
            queues.map((q) => appMetric('FailedJobs', { Queue: q }, Duration.minutes(1))),
          ),
        ],
        [
          graph('Manual Review backlog', [appMetric('UnmatchedMailPending'), appMetric('MyReviewsPending')]),
          graph('Integrations', [
            appMetric('CopycatFailures15m'),
            appMetric('BimaSetuInboundRetrying'),
            appMetric('BimaSetuInboundRejected1h'),
          ]),
          graph('SLA sweep errors', [appMetric('JobErrors', { Job: 'sla-sweep' })]),
        ],
        [
          graph('API requests and 5xx', [
            app.alb.metrics.requestCount({ period: five, statistic: 'Sum' }),
            app.alb.metrics.httpCodeTarget(elbv2.HttpCodeTarget.TARGET_5XX_COUNT, {
              period: five,
              statistic: 'Sum',
            }),
          ]),
          graph('API latency p95', [app.alb.metrics.targetResponseTime({ period: five, statistic: 'p95' })]),
          graph('Running tasks', [
            serviceTasks(app.apiService.serviceName),
            serviceTasks(app.workerService.serviceName),
            serviceTasks(app.clamavService.serviceName),
          ]),
        ],
        [
          graph('Postgres CPU / connections', [
            data.db.metricCPUUtilization({ period: five }),
            data.db.metricDatabaseConnections({ period: five }),
          ]),
          graph('Postgres free storage', [data.db.metricFreeStorageSpace({ period: five })]),
          graph('Redis memory %', data.redisNodeIds.map(redisMemory)),
        ],
      ],
    });
  }
}
