import {
  EntityLockReason,
  INDUSTRY_TYPES_SEED,
  MandateType,
  RiskTier,
  Stage,
} from '@bimaplacement/contracts';
import { DataSource } from 'typeorm';
import { TEST_USERS, TestApp, as, createTestApp } from './helpers/app';

/**
 * Mandates (M4 3.1, FR-276..280, BR-026, BR-135, BR-136): Exclusive Placement Mandate requests through
 * reminder / considering / signed / declined / withdrawn, and the Incumbent Approach Mandate that
 * unblocks a rollover incumbent.
 */
describe('Mandates: Exclusive Placement requests and the Incumbent Approach Mandate', () => {
  let t: TestApp;
  let ds: DataSource;
  let pm: ReturnType<typeof as>;
  let rmUserId: string;
  let incumbent: { insurerId: string; branchId: string };

  const newTicket = async (extra: Record<string, unknown> = {}) =>
    (
      await pm
        .post('/tickets', {
          rfqLinkUrl: 'https://example.test/rfq/e2e-mandate',
          businessName: 'E2E Mandate Pvt Ltd',
          industryType: INDUSTRY_TYPES_SEED[0],
          productType: 'GMC',
          businessType: 'New',
          rmUserId,
          ...extra,
        })
        .expect(201)
    ).body as { id: string; ticketNo: string; stage: string; internalStatus: string };
  const mandate = async (id: string) => (await pm.get(`/tickets/${id}/mandate`).expect(200)).body;

  beforeAll(async () => {
    t = await createTestApp();
    ds = t.app.get(DataSource);
    pm = as(t, TEST_USERS.pm);

    // E2E FIXTURE - mock RM and incumbent insurer (not PRD data)
    [{ id: rmUserId }] = await ds.query(
      `INSERT INTO users (sahayak_user_id, email, name, roles, row_version) VALUES ('dev:rm.mandate.e2e@bimakavach.test', 'rm.mandate.e2e@bimakavach.test', 'E2E RM Mandate', '{rm}', 1) RETURNING id`,
    );
    const [{ id: insurerId }] = await ds.query(
      `INSERT INTO insurers (code, name, status, row_version) VALUES ('e2e-incumbent', 'E2E Incumbent Insurer', 'Active', 1) RETURNING id`,
    );
    const [{ id: branchId }] = await ds.query(
      `INSERT INTO insurer_branches (insurer_id, name, status, row_version) VALUES ($1, 'E2E Branch', 'Active', 1) RETURNING id`,
      [insurerId],
    );
    await ds.query(
      `INSERT INTO insurer_pocs (branch_id, product_group, name, email, row_version) VALUES ($1, 'EB', 'E2E Incumbent POC', 'eb.incumbent@insurer.example.test', 1)`,
      [branchId],
    );
    incumbent = { insurerId, branchId };
  });

  afterAll(async () => {
    await t?.app.close();
  });

  describe('Exclusive Placement Mandate request: remind -> considering -> signed', () => {
    let ticket: Awaited<ReturnType<typeof newTicket>>;

    beforeAll(async () => {
      ticket = await newTicket();
    });

    it('requests the mandate (MR-01) and allows only one open request (FR-276, FR-277, BR-135)', async () => {
      const res = await pm
        .post(`/tickets/${ticket.id}/mandate/requests`, {
          reason: 'Client relies on our market view',
          message: 'Please ask the client for the mandate',
        })
        .expect(201);
      expect(res.body).toMatchObject({ ref: 'MR-01', status: 'requested' });
      expect((await mandate(ticket.id)).state).toBe('requested');

      await pm
        .post(`/tickets/${ticket.id}/mandate/requests`, { reason: 'Other', message: 'again' })
        .expect(422);
    });

    it('sends reminders (FR-278)', async () => {
      await pm.post(`/tickets/${ticket.id}/mandate/requests/remind`, {}).expect(201);
      const res = await pm
        .post(`/tickets/${ticket.id}/mandate/requests/remind`, { note: 'Following up' })
        .expect(201);
      expect(res.body.events.filter((e: { kind: string }) => e.kind === 'reminder')).toHaveLength(2);
    });

    it('records Considering, which keeps the request open (FR-279)', async () => {
      await pm
        .post(`/tickets/${ticket.id}/mandate/requests/response`, {
          kind: 'considering',
          note: "Client's CFO is reviewing",
        })
        .expect(201);
      expect((await mandate(ticket.id)).state).toBe('considering');
    });

    it('records Signed as the Exclusive Placement Mandate on the ticket, without touching the ticket status (FR-280, BR-136)', async () => {
      await pm.post(`/tickets/${ticket.id}/mandate/requests/response`, { kind: 'signed' }).expect(201);
      const m = await mandate(ticket.id);
      expect(m.state).toBe('signed');
      expect(m.mandates).toHaveLength(1);
      expect(m.mandates[0]).toMatchObject({
        type: MandateType.EXCLUSIVE_PLACEMENT,
        reference: `MND-${ticket.ticketNo.replace('PLC-', '')}-E`,
        source: 'mandate_request',
      });

      const after = (await pm.get(`/tickets/${ticket.id}`).expect(200)).body;
      expect(after).toMatchObject({ stage: ticket.stage, internalStatus: ticket.internalStatus });

      await pm.post(`/tickets/${ticket.id}/mandate/requests/remind`, {}).expect(422); // nothing open any more
      await pm.post(`/tickets/${ticket.id}/mandate/requests`, { reason: 'Other', message: 'x' }).expect(422); // already on file
    });
  });

  describe('declined and withdrawn requests allow a new request (BR-135)', () => {
    let ticket: Awaited<ReturnType<typeof newTicket>>;

    beforeAll(async () => {
      ticket = await newTicket();
      await pm
        .post(`/tickets/${ticket.id}/mandate/requests`, {
          reason: 'Tight renewal timeline',
          message: 'Please ask',
        })
        .expect(201);
    });

    it('needs a reason to decline (FR-279)', async () => {
      await pm.post(`/tickets/${ticket.id}/mandate/requests/response`, { kind: 'declined' }).expect(422);
      await pm
        .post(`/tickets/${ticket.id}/mandate/requests/response`, {
          kind: 'declined',
          declineReason: 'Client wants to see all options and decide',
        })
        .expect(201);
      expect((await mandate(ticket.id)).state).toBe('declined');
    });

    it('opens MR-02 after the decline, then withdraws it with a note (FR-278)', async () => {
      const res = await pm
        .post(`/tickets/${ticket.id}/mandate/requests`, { reason: 'Other', message: 'Asking again' })
        .expect(201);
      expect(res.body.ref).toBe('MR-02');
      await pm
        .post(`/tickets/${ticket.id}/mandate/requests/withdraw`, { note: 'Client decided without us' })
        .expect(201);
      const m = await mandate(ticket.id);
      expect(m.requests.map((r: { ref: string; status: string }) => `${r.ref}:${r.status}`)).toEqual([
        'MR-02:withdrawn',
        'MR-01:declined',
      ]);
    });
  });

  describe('Incumbent Approach Mandate unblocks the rollover incumbent (BR-026)', () => {
    let ticket: Awaited<ReturnType<typeof newTicket>>;

    beforeAll(async () => {
      ticket = await newTicket({ businessType: 'Rollover', incumbentInsurer: incumbent.insurerId });
      await pm.put(`/tickets/${ticket.id}/rfq/risk-tier`, { value: RiskTier.PREFERRED }).expect(200);
      await pm.post(`/tickets/${ticket.id}/rfq/validate`).expect(201);
    });

    it('locks the incumbent on the panel without the mandate', async () => {
      expect((await pm.get(`/tickets/${ticket.id}`).expect(200)).body.stage).toBe(Stage.INSURER_SELECTION);
      const res = await pm.put(`/tickets/${ticket.id}/panel`, { ...incumbent, selected: true }).expect(422);
      expect(res.body.message).toContain(EntityLockReason.INCUMBENT_MANDATE_NEEDED);
    });

    it('refuses the mandate on a non-rollover ticket', async () => {
      const other = await newTicket();
      const doc = (
        await pm
          .upload(
            '/documents',
            { ticketId: other.id, kind: 'mandate_proof' },
            { name: 'proof.pdf', content: '%PDF-1.4 proof' },
          )
          .expect(201)
      ).body;
      await pm.post(`/tickets/${other.id}/mandate/incumbent`, { proofDocumentId: doc.id }).expect(422);
    });

    it('records the mandate from an uploaded proof and the incumbent becomes selectable', async () => {
      const doc = (
        await pm
          .upload(
            '/documents',
            { ticketId: ticket.id, kind: 'mandate_proof' },
            { name: 'incumbent-mandate.pdf', content: '%PDF-1.4 mandate' },
          )
          .expect(201)
      ).body;
      const res = await pm
        .post(`/tickets/${ticket.id}/mandate/incumbent`, { proofDocumentId: doc.id })
        .expect(201);
      expect(res.body).toMatchObject({
        type: MandateType.INCUMBENT_APPROACH,
        reference: `MND-${ticket.ticketNo.replace('PLC-', '')}-A`,
        proofDocumentId: doc.id,
      });

      await pm.put(`/tickets/${ticket.id}/panel`, { ...incumbent, selected: true }).expect(200);
      await pm.post(`/tickets/${ticket.id}/mandate/incumbent`, { proofDocumentId: doc.id }).expect(422); // only once
    });
  });
});
