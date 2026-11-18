import {
  type ThreadView,
  CopycatStatus,
  EntityLockReason,
  INDUSTRY_TYPES_SEED,
  InternalStatus,
  QcrSource,
  QcrStatus,
  RiskTier,
  SlaId,
  Stage,
  ThreadStatus,
  formatCopycatRequestId,
  formatThreadRef,
} from '@bimaplacement/contracts';
import { DataSource } from 'typeorm';
import { OutboxRelayHandler } from '../src/infrastructure/outbox/outbox-relay.handler';
import { CopycatRunnerHandler } from '../src/integrations/copycat/copycat-runner.handler';
import { TEST_USERS, TestApp, as, createTestApp } from './helpers/app';

/**
 * Manual ticket from intake to the auto-queued Copycat draft, through the real HTTP API on a fresh
 * migrated + seeded database. Steps share state and run in order.
 */
describe('Golden path: manual ticket -> RFQ review -> float -> quotes -> Copycat QCR -> release -> client decision', () => {
  let t: TestApp;
  let ds: DataSource;
  let pm: ReturnType<typeof as>;

  let rmUserId: string;
  const insurers: Record<'a' | 'b' | 'c' | 'dnf', { insurerId: string; branchId: string }> = {} as never;
  let ticketId: string;
  let ticketNo: string;
  let queryId: string;
  let threadIds: string[];
  let quoteIds: string[];

  const ticket = async () => (await pm.get(`/tickets/${ticketId}`).expect(200)).body;
  const threads = async () => (await pm.get(`/tickets/${ticketId}/threads`).expect(200)).body as ThreadView[];

  beforeAll(async () => {
    t = await createTestApp();
    ds = t.app.get(DataSource);
    pm = as(t, TEST_USERS.pm);

    // E2E FIXTURE - mock RM and insurers (not PRD masters)
    [{ id: rmUserId }] = await ds.query(
      `INSERT INTO users (sahayak_user_id, email, name, roles, row_version) VALUES ('dev:rm.e2e@bimakavach.test', 'rm.e2e@bimakavach.test', 'E2E RM', '{rm}', 1) RETURNING id`,
    );
    const mockInsurers = [
      ['a', 'e2e-a', 'E2E Insurer A', 'Active'],
      ['b', 'e2e-b', 'E2E Insurer B', 'Active'],
      ['c', 'e2e-c', 'E2E Insurer C', 'Active'],
      ['dnf', 'e2e-dnf', 'E2E Insurer Do Not Float', 'Do Not Float'],
    ] as const;
    for (const [key, code, name, status] of mockInsurers) {
      const [{ id: insurerId }] = await ds.query(
        `INSERT INTO insurers (code, name, status, row_version) VALUES ($1, $2, $3, 1) RETURNING id`,
        [code, name, status],
      );
      const [{ id: branchId }] = await ds.query(
        `INSERT INTO insurer_branches (insurer_id, name, status, row_version) VALUES ($1, 'E2E Branch', 'Active', 1) RETURNING id`,
        [insurerId],
      );
      await ds.query(
        `INSERT INTO insurer_pocs (branch_id, product_group, name, email, row_version) VALUES ($1, 'EB', $2, $3, 1)`,
        [branchId, `${name} EB POC`, `eb.${code}@insurer.example.test`],
      );
      insurers[key] = { insurerId, branchId };
    }
  });

  afterAll(async () => {
    await t?.app.close();
  });

  it('creates a manual ticket in RFQ Review on SLA-02, owned by the creating PM (FR-192, FR-198, FR-200)', async () => {
    const res = await pm
      .post('/tickets', {
        rfqLinkUrl: 'https://example.test/rfq/e2e-gmc',
        businessName: 'E2E Client Pvt Ltd',
        industryType: INDUSTRY_TYPES_SEED[0],
        productType: 'GMC',
        businessType: 'New',
        rmUserId,
      })
      .expect(201);
    ticketId = res.body.id;
    ticketNo = res.body.ticketNo;
    expect(res.body.ticketNo).toMatch(/^PLC-\d{4}$/);
    expect(res.body).toMatchObject({ channel: 'manual', stage: Stage.RFQ_REVIEW, slaId: SlaId.SLA_02 });

    const [{ id: pmId }] = await ds.query(`SELECT id FROM users WHERE email = 'pm.e2e@bimakavach.test'`);
    expect(res.body.ownerId).toBe(pmId);
  });

  it('returns the TicketDetail read model: owner, RM, live SLA-02 clock and next action (PLAN 1.1)', async () => {
    const d = await ticket();
    expect(d).toMatchObject({
      ticketNo,
      owner: { name: 'E2E Placement Manager' },
      rm: { id: rmUserId, name: 'E2E RM' },
      createdBy: { name: 'E2E Placement Manager' },
      sla: { slaId: SlaId.SLA_02, ownerType: 'internal', targetMins: 60, breached: false },
      usableQuoteCount: 0,
      mandateState: 'none',
      panelLocked: false,
      nextAction: { tab: 'rfq', tone: 'purple' },
    });
    expect(d.sla.remainingMins).toBeLessThanOrEqual(60);
    expect((await pm.get(`/tickets/by-no/${ticketNo}`).expect(200)).body.id).toBe(ticketId);
  });

  it('raises an RM query and waits on the RM (M2)', async () => {
    const res = await pm
      .post(`/tickets/${ticketId}/rfq/queries`, { newQueries: ['Share the employee census'] })
      .expect(201);
    queryId = res.body[0].id;
    expect((await ticket()).stage).toBe(Stage.AWAITING_RM);
  });

  it('returns to RFQ Review when the RM answers, without resolving the query (BR-111)', async () => {
    await pm.post(`/dev/tickets/${ticketId}/rm-reply`, { text: 'Census attached' }).expect(201);
    expect((await ticket()).stage).toBe(Stage.RFQ_REVIEW);

    const queries = (await pm.get(`/tickets/${ticketId}/rfq/queries`).expect(200)).body;
    expect(queries).toHaveLength(1);
    expect(queries[0].resolved).toBe(false);
  });

  it('blocks Validate while a query is open, then validates once it is resolved (FR-014, FR-260)', async () => {
    await pm.put(`/tickets/${ticketId}/rfq/risk-tier`, { value: RiskTier.NON_PREFERRED }).expect(200);

    const blocked = await pm.post(`/tickets/${ticketId}/rfq/validate`).expect(422);
    expect(blocked.body.code).toBe('GUARD_FAILED');

    await pm.post(`/tickets/${ticketId}/rfq/queries/${queryId}/resolve`).expect(201);
    await pm.post(`/tickets/${ticketId}/rfq/validate`).expect(201);
    expect((await ticket()).stage).toBe(Stage.INSURER_SELECTION);
  });

  it('refuses a Do Not Float insurer on the panel with 422 (FR-212, BR-026)', async () => {
    const res = await pm.put(`/tickets/${ticketId}/panel`, { ...insurers.dnf, selected: true }).expect(422);
    expect(res.body.message).toContain(EntityLockReason.DO_NOT_FLOAT);
  });

  it('floats to three insurers: one thread each on the SLA-06 EB / Non-preferred target of 7 BD (FR-045..055, FR-217)', async () => {
    for (const key of ['a', 'b', 'c'] as const) {
      await pm.put(`/tickets/${ticketId}/panel`, { ...insurers[key], selected: true }).expect(200);
    }
    await pm.post(`/tickets/${ticketId}/rfq/float`).expect(201);

    const tk = await ticket();
    expect(tk).toMatchObject({
      stage: Stage.MARKET,
      panelLocked: true,
      internalStatus: InternalStatus.QUOTE_COLLECTION_IN_PROGRESS,
    });

    const list = await threads();
    expect(list.map((x) => x.threadRef)).toEqual([1, 2, 3].map(formatThreadRef));
    for (const th of list) expect(th).toMatchObject({ status: ThreadStatus.RFQ_SENT, targetMins: 7 * 540 });
    threadIds = list.map((x) => x.id);
  });

  it('holds one thread for RM information and resumes it on reply, leaving the others running (FR-063, FR-064)', async () => {
    const [held] = threadIds;
    await pm
      .post(`/dev/tickets/${ticketId}/threads/${held}/insurer`, {
        kind: 'clarification',
        text: 'Need 3-year claims history',
      })
      .expect(201);
    const [{ name: heldInsurer }] = await ds.query(
      `SELECT i.name FROM insurer_threads t JOIN insurers i ON i.id = t.insurer_id WHERE t.id = $1`,
      [held],
    );
    expect((await ticket()).nextAction).toEqual({
      label: `Reply to ${heldInsurer} clarification`,
      tab: 'threads',
      tone: 'orange',
    });
    await pm
      .post(`/tickets/${ticketId}/threads/${held}/hold-for-rm`, {
        request: 'Please share 3-year claims history',
      })
      .expect(201);

    let list = await threads();
    expect(list[0]).toMatchObject({
      status: ThreadStatus.AWAITING_RM,
      pauseReason: 'Please share 3-year claims history',
    });
    expect(list[0].held).toBe(true);
    expect(list.slice(1).map((x) => x.status)).toEqual([ThreadStatus.RFQ_SENT, ThreadStatus.RFQ_SENT]);
    expect((await ticket()).internalStatus).toBe(InternalStatus.AWAITING_RM_INFORMATION);

    await pm
      .post(`/tickets/${ticketId}/threads/${held}/reply`, { text: 'Claims history attached' })
      .expect(201);
    list = await threads();
    expect(list[0]).toMatchObject({ status: ThreadStatus.ACKNOWLEDGED, held: false });
    expect((await ticket()).internalStatus).toBe(InternalStatus.QUOTE_COLLECTION_IN_PROGRESS);
  });

  it('moves to Quote Review when quotes arrive (M8)', async () => {
    quoteIds = [];
    for (const threadId of threadIds) {
      const res = await pm
        .post(`/dev/tickets/${ticketId}/threads/${threadId}/insurer`, { kind: 'quote' })
        .expect(201);
      quoteIds.push(res.body.id);
    }
    expect(await ticket()).toMatchObject({
      stage: Stage.QUOTE_REVIEW,
      internalStatus: InternalStatus.QUOTE_REVIEW_REQUIRED,
    });
    expect((await threads()).every((x) => x.status === ThreadStatus.QUOTE_RECEIVED)).toBe(true);
  });

  it('stays in Quote Review below the threshold of 3 usable quotes (BR-061)', async () => {
    for (const quoteId of quoteIds.slice(0, 2)) {
      await pm.post(`/tickets/${ticketId}/quotes/${quoteId}/decision`, { decision: 'usable' }).expect(201);
    }
    const tk = await ticket();
    expect(tk).toMatchObject({ stage: Stage.QUOTE_REVIEW, followUpsStopped: false });
    expect((await pm.get(`/tickets/${ticketId}/qcrs`).expect(200)).body).toHaveLength(0);
  });

  it('on the third usable insurer stops follow-ups and auto-queues the Copycat draft (FR-096, FR-097)', async () => {
    await pm.post(`/tickets/${ticketId}/quotes/${quoteIds[2]}/decision`, { decision: 'usable' }).expect(201);

    expect(await ticket()).toMatchObject({
      stage: Stage.QCR_DRAFT,
      internalStatus: InternalStatus.QCR_GENERATION_IN_PROGRESS,
      sla: { slaId: SlaId.SLA_11 },
      followUpsStopped: true,
    });

    const requestId = formatCopycatRequestId(ticketNo, 1, 1);
    const qcrs = (await pm.get(`/tickets/${ticketId}/qcrs`).expect(200)).body;
    expect(qcrs).toHaveLength(1);
    expect(qcrs[0]).toMatchObject({
      version: 1,
      status: QcrStatus.DRAFT,
      source: QcrSource.COPYCAT,
      copycatRequestId: requestId,
      copycatStatus: CopycatStatus.QUEUED,
    });
    expect([...qcrs[0].quoteIds].sort()).toEqual([...quoteIds].sort());

    const [cc] = await ds.query(`SELECT status FROM copycat_requests WHERE request_id = $1`, [requestId]);
    expect(cc.status).toBe(CopycatStatus.QUEUED);
  });

  it('lists the ticket in the queue as a TicketListItem with 3 usable quotes (PLAN 1.1)', async () => {
    const { items, total } = (await pm.get('/tickets?tab=all').expect(200)).body;
    expect(total).toBeGreaterThanOrEqual(1);
    const row = items.find((x: { id: string }) => x.id === ticketId);
    expect(row).toMatchObject({
      ticketNo,
      stage: Stage.QCR_DRAFT,
      usableQuoteCount: 3,
      owner: { name: 'E2E Placement Manager' },
      sla: { slaId: SlaId.SLA_11 },
    });
    expect(row).not.toHaveProperty('nextAction'); // list items stay light
  });

  it('relays every outbox event written along the way (outbox pattern, no external calls in transactions)', async () => {
    const counts = async () =>
      Object.fromEntries(
        (
          await ds.query(
            `SELECT event_type, count(*)::int AS n FROM outbox_events WHERE aggregate_id = $1 GROUP BY event_type`,
            [ticketId],
          )
        ).map((r: { event_type: string; n: number }) => [r.event_type, r.n]),
      );
    expect(await counts()).toMatchObject({ 'mail.rfq_float': 3, 'copycat.generate': 1 });

    // the relay works in batches; other specs share this DB, so drain it the way the worker would (one batch per tick)
    const pending = async (where = '') =>
      (
        await ds.query(
          `SELECT count(*)::int AS n FROM outbox_events WHERE published_at IS NULL ${where}`,
          where ? [ticketId] : [],
        )
      )[0].n;
    for (let tick = 0; tick < 50 && (await pending()) > 0; tick++)
      await t.app.get(OutboxRelayHandler).handle();

    expect(await pending('AND aggregate_id = $1')).toBe(0);
    expect(await pending()).toBe(0);
  });

  it('generates the QCR with Copycat (mock), stores the file and keeps rows unchecked (FR-178, FR-286)', async () => {
    const requestId = formatCopycatRequestId(ticketNo, 1, 1);
    await t.app.get(CopycatRunnerHandler).handle('copycat.generate', { requestId });
    await t.app.get(CopycatRunnerHandler).handle('copycat.generate', { requestId }); // redelivery is a no-op

    const [cc] = await ds.query(
      `SELECT status, result_document_id FROM copycat_requests WHERE request_id = $1`,
      [requestId],
    );
    expect(cc.status).toBe(CopycatStatus.READY);
    const [doc] = await ds.query(`SELECT kind FROM documents WHERE id = $1`, [cc.result_document_id]);
    expect(doc.kind).toBe('qcr');

    const [qcr] = (await pm.get(`/tickets/${ticketId}/qcrs`).expect(200)).body;
    expect(qcr).toMatchObject({ documentId: cc.result_document_id, rowsChecked: false });
    // rows autofill from Copycat's comparison and stay editable (FR-286, Rohit 2026-11-02)
    const rows = (await pm.get(`/tickets/${ticketId}/qcrs/${qcr.id}/rows`).expect(200)).body;
    expect(rows).toHaveLength(3);
    for (const r of rows) {
      expect(r.premium).toBeGreaterThan(0);
      expect(r).toMatchObject({
        sumInsured: 'As per RFQ',
        termsNote: 'Key terms: Mock Copycat comparison (dev)',
        edited: [],
      });
      expect(r.validityDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(r.autofill.premium).toEqual({ value: r.premium, source: 'copycat' });
    }
    const path = `/tickets/${ticketId}/qcrs/${qcr.id}/rows/${rows[0].quoteId}`;
    await pm.patch(path, { field: 'sumInsured', value: 'INR 5 Cr' }).expect(200);
    let [edited] = (await pm.get(`/tickets/${ticketId}/qcrs/${qcr.id}/rows`).expect(200)).body.filter(
      (r: { quoteId: string }) => r.quoteId === rows[0].quoteId,
    );
    expect(edited).toMatchObject({ sumInsured: 'INR 5 Cr', edited: ['sumInsured'] });
    await pm.patch(path, { field: 'sumInsured', value: 'As per RFQ' }).expect(200); // back to the QCR value
    [edited] = (await pm.get(`/tickets/${ticketId}/qcrs/${qcr.id}/rows`).expect(200)).body.filter(
      (r: { quoteId: string }) => r.quoteId === rows[0].quoteId,
    );
    expect(edited.edited).toEqual([]);
    expect(await ticket()).toMatchObject({
      stage: Stage.QCR_DRAFT,
      internalStatus: InternalStatus.PENDING_PLACEMENT_RELEASE,
    });
  });

  it('releases the QCR to the RM only after the quote rows are checked (FR-101, FR-241)', async () => {
    const [qcr] = (await pm.get(`/tickets/${ticketId}/qcrs`).expect(200)).body;
    const blocked = await pm.post(`/tickets/${ticketId}/qcrs/${qcr.id}/release`, {}).expect(422);
    expect(blocked.body.message).toContain('Quote rows checked');

    await pm.put(`/tickets/${ticketId}/qcrs/${qcr.id}/rows-checked`, { checked: true }).expect(200);
    await pm
      .post(`/tickets/${ticketId}/qcrs/${qcr.id}/release`, { coverNote: 'Three options attached' })
      .expect(201);

    expect(await ticket()).toMatchObject({ stage: Stage.QCR_RELEASED, sla: { slaId: SlaId.SLA_14 } });
    const [released] = (await pm.get(`/tickets/${ticketId}/qcrs`).expect(200)).body;
    expect(released).toMatchObject({ status: QcrStatus.RELEASED, sentTo: 'E2E RM (RM)' });
  });

  it('closes the manual ticket when the PM logs the client decision (FR-269, BR-137)', async () => {
    const [qcr] = (await pm.get(`/tickets/${ticketId}/qcrs`).expect(200)).body;
    const rows = (await pm.get(`/tickets/${ticketId}/qcrs/${qcr.id}/rows`).expect(200)).body;
    expect(rows).toHaveLength(3);

    await pm
      .post(`/tickets/${ticketId}/client-decision`, { kind: 'quote_selected', qcrRowId: rows[0].id })
      .expect(201);
    expect(await ticket()).toMatchObject({
      stage: Stage.CLOSED,
      outcome: 'quote_selected',
      sla: { slaId: null },
    });
  });

  it('keeps the audit trail append-only (DB trigger)', async () => {
    const [{ n }] = await ds.query(`SELECT count(*)::int AS n FROM audit_events WHERE ticket_id = $1`, [
      ticketId,
    ]);
    expect(n).toBeGreaterThan(0);
    await expect(ds.query(`DELETE FROM audit_events WHERE ticket_id = $1`, [ticketId])).rejects.toThrow();
  });
});
