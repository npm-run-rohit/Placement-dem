/** Logical queue names. With MESSAGING_DRIVER=aws each maps to an SQS queue `${prefix}${name}` (+ DLQ). */
export const QUEUES = {
  OUTBOX_RELAY: 'outbox-relay',
  BIMASETU_INBOUND: 'bimasetu-inbound',
  BIMASETU_OUTBOUND: 'bimasetu-outbound',
  COPYCAT: 'copycat-runner',
  SLA_SWEEP: 'sla-sweep',
  MAIL_INBOUND: 'mail-inbound',
  MAIL_OUTBOUND: 'mail-outbound',
  NOTIFICATIONS: 'notifications',
  RECONCILIATION: 'bimasetu-reconciliation',
  OPS_METRICS: 'ops-metrics',
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];
