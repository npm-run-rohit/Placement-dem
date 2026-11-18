import type { MetricDatum } from './metrics.port';

/**
 * CloudWatch Embedded Metric Format: one JSON object per dimension set. The awslogs driver ships stdout to
 * CloudWatch Logs, which turns each object into metrics; no SDK call and no extra IAM permission.
 * https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch_Embedded_Metric_Format_Specification.html
 */
export function emfObjects(namespace: string, data: MetricDatum[], at: Date): Array<Record<string, unknown>> {
  const groups = new Map<string, MetricDatum[]>();
  for (const d of data) {
    const dims = d.dimensions ?? {};
    const key = JSON.stringify(Object.entries(dims).sort(([a], [b]) => a.localeCompare(b)));
    groups.set(key, [...(groups.get(key) ?? []), d]);
  }
  return [...groups.values()].map((group) => {
    const dims = group[0].dimensions ?? {};
    const obj: Record<string, unknown> = {
      _aws: {
        Timestamp: at.getTime(),
        CloudWatchMetrics: [
          {
            Namespace: namespace,
            Dimensions: [Object.keys(dims)],
            Metrics: group.map((d) => ({ Name: d.name, Unit: d.unit })),
          },
        ],
      },
      ...dims,
    };
    for (const d of group) obj[d.name] = d.value;
    return obj;
  });
}
