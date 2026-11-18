import {
  INDUSTRY_TYPES_SEED,
  RiskTier,
  Stage,
  type RevisionView,
  type TaskView,
} from '@bimaplacement/contracts';
import { DataSource } from 'typeorm';
import { TEST_USERS, TestApp, as, createTestApp } from './helpers/app';

/** Revision rounds (PLAN 3.5, FR-250, FR-287): a revision opens a PM task; handling it closes both. */
describe('Revisions and PM tasks', () => {
  let t: TestApp;
  let ds: DataSource;
  let pm: ReturnType<typeof as>;
  let head: ReturnType<typeof as>;
  let rmUserId: string;
  let insurerId: string;
  let branchId: string;

  const tasks = async (who = pm): Promise<TaskView[]> => (await who.get('/me/tasks').expect(200)).body;
  const revisions = async (id: string): Promise<RevisionView[]> =>
    (await pm.get(`/tickets/${id}/revisions`).expect(200)).body;

  /** A manual-QCR ticket released to the RM: one insurer thread, one usable quote. */
  const released = async (name: string) => {
    const id = (
      await pm
        .post('/tickets', {
          rfqLinkUrl: 'https://example.test/rfq/e2e-rev',
          businessName: name,
          industryType: INDUSTRY_TYPES_SEED[0],
          productType: 'GMC',
          businessType: 'New',
          rmUserId,
        })
        .expect(201)
    ).body.id;
    await pm.put(`/tickets/${id}/rfq/risk-tier`, { value: RiskTier.PREFERRED }).expect(200);
    await pm.post(`/tickets/${id}/rfq/validate`).expect(201);
    await pm.put(`/tickets/${id}/panel`, { insurerId, branchId, selected: true }).expect(200);
    await pm.post(`/tickets/${id}/rfq/float`).expect(201);
    const [thread] = (await pm.get(`/tickets/${id}/threads`).expect(200)).body;
    const quote = (
      await pm.post(`/dev/tickets/${id}/threads/${thread.id}/insurer`, { kind: 'quote' }).expect(201)
    ).body;
    await pm.post(`/tickets/${id}/quotes/${quote.id}/decision`, { decision: 'usable' }).expect(201);
    const doc = (
      await pm
        .upload('/documents', { ticketId: id, kind: 'qcr' }, { name: 'QCR_rev.pdf', content: '%PDF-1.4 qcr' })
        .expect(201)
    ).body;
    await pm
      .post(`/tickets/${id}/qcrs/upload`, { documentId: doc.id, earlyReleaseReason: 'Client wants it fast' })
      .expect(201);
    const [qcr] = (await pm.get(`/tickets/${id}/qcrs`).expect(200)).body;
    await pm.put(`/tickets/${id}/qcrs/${qcr.id}/rows-checked`, { checked: true }).expect(200);
    await pm.post(`/tickets/${id}/qcrs/${qcr.id}/release`, {}).expect(201);
    return { id, threadId: thread.id as string };
  };

  beforeAll(async () => {
    t = await createTestApp();
    ds = t.app.get(DataSource);
    pm = as(t, TEST_USERS.pm);
    head = as(t, TEST_USERS.head);
    // E2E FIXTURE - mock RM and one insurer branch (not PRD data)
    [{ id: rmUserId }] = await ds.query(
      `INSERT INTO users (sahayak_user_id, email, name, roles, row_version) VALUES ('dev:rm.rev.e2e@bimakavach.test', 'rm.rev.e2e@bimakavach.test', 'E2E RM Revision', '{rm}', 1) RETURNING id`,
    );
    [{ id: insurerId }] = await ds.query(
      `INSERT INTO insurers (code, name, status, row_version) VALUES ('e2e-rev', 'E2E Revision Insurer', 'Active', 1) RETURNING id`,
    );
    [{ id: branchId }] = await ds.query(
      `INSERT INTO insurer_branches (insurer_id, name, status, row_version) VALUES ($1, 'E2E Branch', 'Active', 1) RETURNING id`,
      [insurerId],
    );
    await ds.query(
      `INSERT INTO insurer_pocs (branch_id, product_group, name, email, row_version) VALUES ($1, 'EB', 'Ravi Rao', 'ravi@rev-insurer.example.test', 1)`,
      [branchId],
    );
  });

  afterAll(async () => {
    await t?.app.close();
  });

  it('opens a revision round with a PM task and contacts no insurer (FR-250, FR-287)', async () => {
    const { id } = await released('E2E Revision One Pvt Ltd');
    const mailsBefore = (
      await ds.query(
        `SELECT count(*)::int AS n FROM outbox_events WHERE aggregate_id = $1 AND destination = 'mail'`,
        [id],
      )
    )[0].n;
    await pm
      .post(`/dev/tickets/${id}/revision`, {
        by: 'client',
        reason: 'Premium too high',
        asks: ['rerate', 'terms'],
      })
      .expect(201);

    expect((await pm.get(`/tickets/${id}`).expect(200)).body.stage).toBe(Stage.REVISION_REQUESTED);
    const [rev] = await revisions(id);
    expect(rev).toMatchObject({
      round: 2,
      qcrVersion: 1,
      by: 'client',
      reason: 'Premium too high',
      asks: ['rerate', 'terms'],
      handledAt: null,
    });
    const { ticketNo } = (await pm.get(`/tickets/${id}`).expect(200)).body;
    const task = (await tasks()).find(
      (x) => x.kind === 'revision_request' && x.link === `/tickets/${ticketNo}/qcr`,
    );
    expect(task).toMatchObject({ status: 'open', label: expect.stringContaining('Revision round 2') });
    const mailsAfter = (
      await ds.query(
        `SELECT count(*)::int AS n FROM outbox_events WHERE aggregate_id = $1 AND destination = 'mail'`,
        [id],
      )
    )[0].n;
    expect(mailsAfter).toBe(mailsBefore); // no insurer contacted until the PM acts
  });

  it('marks the revision handled and closes the task when the PM restarts threads', async () => {
    const { id, threadId } = await released('E2E Revision Two Pvt Ltd');
    await pm.post(`/dev/tickets/${id}/revision`, {}).expect(201);
    const openBefore = (await tasks()).filter((x) => x.kind === 'revision_request').length;
    await pm
      .post(`/tickets/${id}/threads/restart`, {
        threadIds: [threadId],
        reason: 'Re-rate requested by the client',
      })
      .expect(201);

    const [rev] = await revisions(id);
    expect(rev).toMatchObject({ handledVia: 'restart_threads', handledAt: expect.any(String) });
    expect((await tasks()).filter((x) => x.kind === 'revision_request')).toHaveLength(openBefore - 1);
    expect((await pm.get(`/tickets/${id}`).expect(200)).body.stage).toBe(Stage.MARKET);
    const audit = (await pm.get(`/tickets/${id}/audit`).expect(200)).body.map(
      (a: { event: string }) => a.event,
    );
    expect(audit).toContain('Revision round 2 handled');
  });

  it('sends the re-rated quote as the next QCR version after a restart (revision round, FR-105, FR-250)', async () => {
    const { id, threadId } = await released('E2E Revision Rerate Pvt Ltd');
    await pm.post(`/dev/tickets/${id}/revision`, {}).expect(201);
    await pm.post(`/tickets/${id}/threads/restart`, { threadIds: [threadId], reason: 'Re-rate' }).expect(201);
    const quote = (
      await pm.post(`/dev/tickets/${id}/threads/${threadId}/insurer`, { kind: 'quote' }).expect(201)
    ).body;
    await pm.post(`/tickets/${id}/quotes/${quote.id}/decision`, { decision: 'usable' }).expect(201);
    expect((await pm.get(`/tickets/${id}`).expect(200)).body.stage).toBe(Stage.MARKET);
    // the QCR tab offers "Create QCR V2" here (usable quote not in V1); it used to answer 422
    await pm.post(`/tickets/${id}/qcrs/next-version`).expect(201);
    const [v2] = (await pm.get(`/tickets/${id}/qcrs`).expect(200)).body;
    expect(v2).toMatchObject({ version: 2, status: 'draft', round: 2 });
    expect((await pm.get(`/tickets/${id}`).expect(200)).body.stage).toBe(Stage.QCR_DRAFT);
  });

  /** Restart from a released QCR WITHOUT a revision request, then a re-quote marked usable (back in market). */
  const restartedWithoutRevision = async (name: string) => {
    const { id, threadId } = await released(name);
    await pm
      .post(`/tickets/${id}/threads/restart`, { threadIds: [threadId], reason: 'Insurer asked to re-quote' })
      .expect(201);
    const quote = (
      await pm.post(`/dev/tickets/${id}/threads/${threadId}/insurer`, { kind: 'quote' }).expect(201)
    ).body;
    await pm.post(`/tickets/${id}/quotes/${quote.id}/decision`, { decision: 'usable' }).expect(201);
    expect((await pm.get(`/tickets/${id}`).expect(200)).body.stage).toBe(Stage.MARKET);
    return id;
  };
  const rounds = async (id: string) =>
    ((await pm.get(`/tickets/${id}/qcrs`).expect(200)).body as Array<{ version: number; round: number }>)
      .map((q) => `V${q.version}:R${q.round}`)
      .sort();

  it('opens the next round for a new QCR version after a restart without a revision (FR-105, BR-066)', async () => {
    const id = await restartedWithoutRevision('E2E Revision Restart Only Pvt Ltd');
    await pm.post(`/tickets/${id}/qcrs/next-version`).expect(201);
    expect(await rounds(id)).toEqual(['V1:R1', 'V2:R2']);
  });

  it('opens the next round for an early release after a released QCR', async () => {
    const id = await restartedWithoutRevision('E2E Revision Early Release Pvt Ltd');
    await pm.post(`/tickets/${id}/qcrs/early-release`, { reason: 'Client wants it fast' }).expect(201);
    expect(await rounds(id)).toEqual(['V1:R1', 'V2:R2']);
  });

  it('marks it handled by RFQ V2 too, and lets a PM close a task by hand', async () => {
    const { id } = await released('E2E Revision Three Pvt Ltd');
    await pm.post(`/dev/tickets/${id}/revision`, { asks: ['cover'] }).expect(201);
    const { ticketNo } = (await pm.get(`/tickets/${id}`).expect(200)).body;
    expect((await tasks()).some((x) => x.link === `/tickets/${ticketNo}/qcr`)).toBe(true);
    await pm
      .post(`/tickets/${id}/rfq/versions`, {
        changeNote: 'Sum insured raised to 12 Cr',
        linkUrl: 'https://example.test/rfq/e2e-rev-v2',
      })
      .expect(201);
    expect((await revisions(id))[0].handledVia).toBe('new_rfq_version');
    expect((await tasks()).some((x) => x.link === `/tickets/${ticketNo}/qcr`)).toBe(false); // FR-250 task closed
    const audit = (await pm.get(`/tickets/${id}/audit`).expect(200)).body.map(
      (a: { event: string }) => a.event,
    );
    expect(audit).toContain('Revision round 2 handled');

    await pm
      .post(`/dev/tickets/${(await released('E2E Revision Four Pvt Ltd')).id}/revision`, {})
      .expect(201);
    const [open] = (await tasks()).filter((x) => x.kind === 'revision_request');
    await head.post(`/me/tasks/${open.id}/done`).expect(404); // someone else's task
    await pm.post(`/me/tasks/${open.id}/done`).expect(201);
    expect((await tasks()).some((x) => x.id === open.id)).toBe(false);
  });

  it('keeps a released QCR and a floated RFQ version frozen in the database (rule 5, FR-103)', async () => {
    const { id } = await released('E2E Revision Frozen Pvt Ltd');
    const [qcr] = (await pm.get(`/tickets/${id}/qcrs`).expect(200)).body;
    await expect(
      ds.query(`UPDATE qcr_versions SET cover_note = 'edited' WHERE id = $1`, [qcr.id]),
    ).rejects.toThrow(/frozen/);
    await expect(ds.query(`DELETE FROM qcr_versions WHERE id = $1`, [qcr.id])).rejects.toThrow(/frozen/);
    await expect(ds.query(`UPDATE qcr_rows SET premium = 1 WHERE qcr_id = $1`, [qcr.id])).rejects.toThrow(
      /frozen/,
    );
    await expect(
      ds.query(
        `UPDATE rfq_versions SET link_url = 'https://example.test/x' WHERE ticket_id = $1 AND floated_at IS NOT NULL`,
        [id],
      ),
    ).rejects.toThrow(/frozen/);
  });

  it('carries the previous insurer selection to RFQ V2, ticked, with prior responders first (FR-132)', async () => {
    const { id } = await released('E2E Revision CarryFwd Pvt Ltd');
    await pm.post(`/dev/tickets/${id}/revision`, { asks: ['cover'] }).expect(201);
    await pm
      .post(`/tickets/${id}/rfq/versions`, {
        changeNote: 'Cover changed',
        linkUrl: 'https://example.test/rfq/e2e-rev-v2b',
      })
      .expect(201);
    const panel = (await pm.get(`/tickets/${id}/insurer-entities`).expect(200)).body as Array<{
      insurerId: string;
      branchId: string;
      selected: boolean;
      priorResponder: boolean;
    }>;
    const ours = panel.find((e) => e.insurerId === insurerId && e.branchId === branchId)!;
    expect(ours).toMatchObject({ selected: true, priorResponder: true });
    expect(panel[0].priorResponder).toBe(true);
  });
});
