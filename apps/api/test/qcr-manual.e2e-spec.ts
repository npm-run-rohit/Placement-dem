import {
  InternalStatus,
  QcrSource,
  QcrStatus,
  RiskTier,
  Stage,
  INDUSTRY_TYPES_SEED,
} from '@bimaplacement/contracts';
import { DataSource } from 'typeorm';
import { TEST_USERS, TestApp, as, createTestApp } from './helpers/app';

/** Manual QCR upload (PLAN 3.3, FR-266/267, FR-107): early release needs a reason; lands at Pending Placement Release. */
describe('Manual QCR upload below the threshold', () => {
  let t: TestApp;
  let ds: DataSource;
  let pm: ReturnType<typeof as>;
  let ticketId: string;

  beforeAll(async () => {
    t = await createTestApp();
    ds = t.app.get(DataSource);
    pm = as(t, TEST_USERS.pm);

    // E2E FIXTURE - mock RM and one insurer (not PRD data)
    const [{ id: rmUserId }] = await ds.query(
      `INSERT INTO users (sahayak_user_id, email, name, roles, row_version) VALUES ('dev:rm.qcr.e2e@bimakavach.test', 'rm.qcr.e2e@bimakavach.test', 'E2E RM QCR', '{rm}', 1) RETURNING id`,
    );
    const [{ id: insurerId }] = await ds.query(
      `INSERT INTO insurers (code, name, status, row_version) VALUES ('e2e-qcr', 'E2E QCR Insurer', 'Active', 1) RETURNING id`,
    );
    const [{ id: branchId }] = await ds.query(
      `INSERT INTO insurer_branches (insurer_id, name, status, row_version) VALUES ($1, 'E2E Branch', 'Active', 1) RETURNING id`,
      [insurerId],
    );
    await ds.query(
      `INSERT INTO insurer_pocs (branch_id, product_group, name, email, row_version) VALUES ($1, 'EB', 'E2E QCR POC', 'eb.qcr@insurer.example.test', 1)`,
      [branchId],
    );

    const created = await pm
      .post('/tickets', {
        rfqLinkUrl: 'https://example.test/rfq/e2e-qcr',
        businessName: 'E2E Manual QCR Pvt Ltd',
        industryType: INDUSTRY_TYPES_SEED[0],
        productType: 'GMC',
        businessType: 'New',
        rmUserId,
      })
      .expect(201);
    ticketId = created.body.id;
    await pm.put(`/tickets/${ticketId}/rfq/risk-tier`, { value: RiskTier.PREFERRED }).expect(200);
    await pm.post(`/tickets/${ticketId}/rfq/validate`).expect(201);
    await pm.put(`/tickets/${ticketId}/panel`, { insurerId, branchId, selected: true }).expect(200);
    await pm.post(`/tickets/${ticketId}/rfq/float`).expect(201);
    const [thread] = (await pm.get(`/tickets/${ticketId}/threads`).expect(200)).body;
    const quote = (
      await pm.post(`/dev/tickets/${ticketId}/threads/${thread.id}/insurer`, { kind: 'quote' }).expect(201)
    ).body;
    await pm.post(`/tickets/${ticketId}/quotes/${quote.id}/decision`, { decision: 'usable' }).expect(201);
  });

  afterAll(async () => {
    await t?.app.close();
  });

  it('lists the quote as a QuoteView with names and the file (PLAN 3.1)', async () => {
    const [q] = (await pm.get(`/tickets/${ticketId}/quotes`).expect(200)).body;
    expect(q).toMatchObject({
      insurer: { name: 'E2E QCR Insurer' },
      threadRef: 'TH-01',
      decision: 'usable',
      targetFlag: 'Target Not Available',
    });
    expect(q.fileName).toMatch(/\.pdf$/);
  });

  it('refuses an upload below the threshold without a reason (FR-107)', async () => {
    const doc = (
      await pm
        .upload(
          '/documents',
          { ticketId, kind: 'qcr' },
          { name: 'QCR_manual.pdf', content: '%PDF-1.4 manual qcr' },
        )
        .expect(201)
    ).body;
    const res = await pm.post(`/tickets/${ticketId}/qcrs/upload`, { documentId: doc.id }).expect(422);
    expect(res.body.message).toContain('reason');
  });

  it('accepts it with a reason as a manual draft at Pending Placement Release (FR-266/267)', async () => {
    const doc = (
      await pm
        .upload(
          '/documents',
          { ticketId, kind: 'qcr' },
          { name: 'QCR_manual_v1.pdf', content: '%PDF-1.4 manual qcr v1' },
        )
        .expect(201)
    ).body;
    await pm
      .post(`/tickets/${ticketId}/qcrs/upload`, {
        documentId: doc.id,
        earlyReleaseReason: 'Client wants it fast',
      })
      .expect(201);

    const [qcr] = (await pm.get(`/tickets/${ticketId}/qcrs`).expect(200)).body;
    expect(qcr).toMatchObject({
      version: 1,
      status: QcrStatus.DRAFT,
      source: QcrSource.MANUAL,
      fileName: 'QCR_manual_v1.pdf',
      earlyReleaseReason: 'Client wants it fast',
      earlyReleaseCount: 1,
    });
    const tk = (await pm.get(`/tickets/${ticketId}`).expect(200)).body;
    expect(tk).toMatchObject({
      stage: Stage.QCR_DRAFT,
      internalStatus: InternalStatus.PENDING_PLACEMENT_RELEASE,
      followUpsStopped: true,
    });

    await pm
      .post(`/tickets/${ticketId}/qcrs/upload`, { documentId: doc.id, earlyReleaseReason: 'again' })
      .expect(422); // one draft at a time
  });

  it('saves what the PM types in a quote row and refuses values that do not fit the field (FR-286)', async () => {
    const [qcr] = (await pm.get(`/tickets/${ticketId}/qcrs`).expect(200)).body;
    const [row] = (await pm.get(`/tickets/${ticketId}/qcrs/${qcr.id}/rows`).expect(200)).body;
    const path = `/tickets/${ticketId}/qcrs/${qcr.id}/rows/${row.quoteId}`;
    await pm.patch(path, { field: 'premium', value: 245000 }).expect(200);
    await pm.patch(path, { field: 'sumInsured', value: 'INR 5 Cr' }).expect(200);
    await pm.patch(path, { field: 'validityDate', value: '2026-12-31' }).expect(200);
    await pm.patch(path, { field: 'termsNote', value: 'Room rent 1%' }).expect(200);
    const [saved] = (await pm.get(`/tickets/${ticketId}/qcrs/${qcr.id}/rows`).expect(200)).body;
    expect(saved).toMatchObject({
      premium: 245000,
      sumInsured: 'INR 5 Cr',
      validityDate: '2026-12-31',
      termsNote: 'Room rent 1%',
    });
    expect(saved.edited).toEqual(
      expect.arrayContaining(['premium', 'sumInsured', 'validityDate', 'termsNote']),
    );

    await pm.patch(path, { field: 'validityDate', value: '30 days' }).expect(422);
    await pm.patch(path, { field: 'premium', value: 'lots' }).expect(422);
    await pm.patch(path, { field: 'premium', value: -5 }).expect(422);
    await pm.patch(path, { field: 'qcrId', value: 'x' }).expect(400);
  });

  it('releases the manual QCR once the rows are checked', async () => {
    const [qcr] = (await pm.get(`/tickets/${ticketId}/qcrs`).expect(200)).body;
    const rows = (await pm.get(`/tickets/${ticketId}/qcrs/${qcr.id}/rows`).expect(200)).body;
    expect(rows).toHaveLength(1);
    await pm.put(`/tickets/${ticketId}/qcrs/${qcr.id}/rows-checked`, { checked: true }).expect(200);
    await pm.post(`/tickets/${ticketId}/qcrs/${qcr.id}/release`, {}).expect(201);
    const [released] = (await pm.get(`/tickets/${ticketId}/qcrs`).expect(200)).body;
    expect(released).toMatchObject({ status: QcrStatus.RELEASED, releasedBy: 'E2E Placement Manager' });
  });
});
