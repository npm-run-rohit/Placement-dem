import { MastersService } from './masters.service';

const users = [
  { name: 'A PM', email: 'a@x.test', mailboxAddress: null },
  { name: 'B PM', email: 'b@x.test', mailboxAddress: 'b.mail@x.test' },
  { name: 'C PM', email: 'c@x.test', mailboxAddress: null },
];
const ds = {
  getRepository: () => ({
    createQueryBuilder: () => {
      const qb = { where: () => qb, orderBy: () => qb, getMany: async () => users };
      return qb;
    },
  }),
};
const config = (driver: string) => ({ get: () => ({ driver }) });
const call = (svc: MastersService) =>
  (svc as unknown as { mailboxStatuses(): Promise<unknown> }).mailboxStatuses();

describe('Admin mailbox status', () => {
  it('is hidden (null) on the dev driver', async () => {
    const svc = new MastersService(ds as never, {} as never, config('dev') as never, {} as never);
    expect(await call(svc)).toBeNull();
  });

  it('asks the provider once for everyone, and marks anyone it does not list as connected=false', async () => {
    const health = jest.fn(async () => ({
      'a@x.test': { ok: true },
      'b.mail@x.test': { ok: false, detail: 'b.mail@x.test has not connected Gmail' },
    }));
    const svc = new MastersService(
      ds as never,
      {} as never,
      config('email-layer') as never,
      { health } as never,
    );
    expect(await call(svc)).toEqual([
      { userName: 'A PM', email: 'a@x.test', mailbox: 'a@x.test', status: 'connected', detail: null },
      {
        userName: 'B PM',
        email: 'b@x.test',
        mailbox: 'b.mail@x.test',
        status: 'not_connected',
        detail: 'b.mail@x.test has not connected Gmail',
      },
      {
        userName: 'C PM',
        email: 'c@x.test',
        mailbox: 'c@x.test',
        status: 'unknown',
        detail: 'no status from the mail provider',
      },
    ]);
    expect(health).toHaveBeenCalledTimes(1);
    expect(health).toHaveBeenCalledWith(['a@x.test', 'b.mail@x.test', 'c@x.test']);
  });

  it('a failing provider makes everyone unknown, and the view still loads', async () => {
    const health = jest.fn(async () => {
      throw new Error('layer down');
    });
    const svc = new MastersService(
      ds as never,
      {} as never,
      config('email-layer') as never,
      { health } as never,
    );
    const rows = (await call(svc)) as Array<{ status: string; detail: string }>;
    expect(rows.map((r) => r.status)).toEqual(['unknown', 'unknown', 'unknown']);
    expect(rows[0].detail).toBe('layer down');
  });
});
