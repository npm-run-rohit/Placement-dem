/** Ops metrics (PLAN 4.6). CloudWatch in AWS (EMF lines on stdout); nothing locally. */
export interface MetricDatum {
  name: string;
  value: number;
  unit: 'Count' | 'Seconds';
  dimensions?: Record<string, string>;
}

export interface Metrics {
  put(data: MetricDatum[]): void;
}

export const METRICS = Symbol('METRICS');
