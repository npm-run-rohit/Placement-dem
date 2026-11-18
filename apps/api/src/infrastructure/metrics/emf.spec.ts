import { emfObjects } from './emf';

describe('emfObjects', () => {
  const at = new Date('2026-11-04T10:00:00Z');

  it('puts metrics without dimensions in one object with an empty dimension set', () => {
    const [obj] = emfObjects(
      'BimaPlacement',
      [
        { name: 'OutboxLagSeconds', value: 12, unit: 'Seconds' },
        { name: 'UnmatchedMailPending', value: 3, unit: 'Count' },
      ],
      at,
    );
    expect(obj).toEqual({
      _aws: {
        Timestamp: at.getTime(),
        CloudWatchMetrics: [
          {
            Namespace: 'BimaPlacement',
            Dimensions: [[]],
            Metrics: [
              { Name: 'OutboxLagSeconds', Unit: 'Seconds' },
              { Name: 'UnmatchedMailPending', Unit: 'Count' },
            ],
          },
        ],
      },
      OutboxLagSeconds: 12,
      UnmatchedMailPending: 3,
    });
  });

  it('splits one object per dimension value, carrying the dimension as a field', () => {
    const objs = emfObjects(
      'BimaPlacement',
      [
        { name: 'FailedJobs', value: 2, unit: 'Count', dimensions: { Queue: 'mail-outbound' } },
        { name: 'FailedJobs', value: 0, unit: 'Count', dimensions: { Queue: 'copycat-runner' } },
      ],
      at,
    );
    expect(objs).toHaveLength(2);
    expect(objs[0]).toMatchObject({ Queue: 'mail-outbound', FailedJobs: 2 });
    expect(
      (objs[0]._aws as { CloudWatchMetrics: Array<{ Dimensions: string[][] }> }).CloudWatchMetrics[0]
        .Dimensions,
    ).toEqual([['Queue']]);
    expect(objs[1]).toMatchObject({ Queue: 'copycat-runner', FailedJobs: 0 });
  });
});
