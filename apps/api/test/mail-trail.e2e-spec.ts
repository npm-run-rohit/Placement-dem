import { RiskTier, INDUSTRY_TYPES_SEED, PRODUCT_TYPES_SEED } from '@bimaplacement/contracts';
import { DataSource } from 'typeorm';
import { MAILBOX, type MailboxConnector } from '../src/infrastructure/mail/mailbox.port';
import {
  MailboxNotConnectedError,
  MailRejectedError,
} from '../src/infrastructure/mail/email-layer-mailbox.adapter';
import { MailOutboundHandler } from '../src/modules/communications/mail-outbound.handler';
import { TEST_USERS, TestApp, as, createTestApp } from './helpers/app';

/** Outbound mail from the assigned PM's mailbox + Mail Trail (PLAN 2.4, M5/M6, FR-050, FR-053, FR-213). */
describe('Mail Trail', () => {
  let t: TestApp;
  let ds: DataSource;
  let pm: ReturnType<typeof as>;
  let ticketId: string;
  let ticketNo: string;
  let insurerId: string;
  let branchId: string;
  let sendSpy: jest.SpyInstance;

  /** What the worker does: relay each unpublished mail outbox row to the mail handler. */
  const deliver = async () => {
    const rows: Array<{
      id: string;
      event_type: string;
      aggregate_id: string;
      created_at: Date;
      payload: Record<string, unknown>;
    }> = await ds.query(
      `SELECT id, event_type, aggregate_id, created_at, payload FROM outbox_events WHERE destination = 'mail' AND aggregate_id = $1 ORDER BY created_at`,
      [ticketId],
    );
    for (const r of rows) {
      await t.app.get(MailOutboundHandler).handle(r.event_type, {
        outboxId: r.id,
        eventType: r.event_type,
        aggregateId: r.aggregate_id,
        occurredAt: r.created_at.toISOString(),
        ...r.payload,
      });
    }
    return rows.length;
  };

  beforeAll(async () => {
    t = await createTestApp();
    ds = t.app.get(DataSource);
    pm = as(t, TEST_USERS.pm);
    sendSpy = jest.spyOn(t.app.get<MailboxConnector>(MAILBOX), 'send');

    // E2E FIXTURE - mock RM and one insurer branch with two POCs (not PRD data)
    const [{ id: rmUserId }] = await ds.query(
      `INSERT INTO users (sahayak_user_id, email, name, roles, row_version) VALUES ('dev:rm.mail.e2e@bimakavach.test', 'rm.mail.e2e@bimakavach.test', 'E2E RM Mail', '{rm}', 1) RETURNING id`,
    );
    [{ id: insurerId }] = await ds.query(
      `INSERT INTO insurers (code, name, status, row_version) VALUES ('e2e-mail', 'E2E Mail Insurer', 'Active', 1) RETURNING id`,
    );
    [{ id: branchId }] = await ds.query(
      `INSERT INTO insurer_branches (insurer_id, name, status, row_version) VALUES ($1, 'E2E Branch', 'Active', 1) RETURNING id`,
      [insurerId],
    );
    await ds.query(
      `INSERT INTO insurer_pocs (branch_id, product_group, name, email, cc_emails, row_version) VALUES ($1, 'EB', 'Asha Rao', 'asha@insurer.example.test', '{boss@insurer.example.test,vikram@insurer.example.test}', 1), ($1, 'EB', 'Vikram Shah', 'vikram@insurer.example.test', '{}', 1)`,
      [branchId],
    );

    const created = await pm
      .post('/tickets', {
        rfqLinkUrl: 'https://example.test/rfq/e2e-mail',
        businessName: 'E2E Mail Trail Pvt Ltd',
        industryType: INDUSTRY_TYPES_SEED[0],
        productType: 'GMC',
        businessType: 'New',
        rmUserId,
      })
      .expect(201);
    ticketId = created.body.id;
    ticketNo = created.body.ticketNo;
    await pm.put(`/tickets/${ticketId}/rfq/risk-tier`, { value: RiskTier.PREFERRED }).expect(200);
    await pm
      .post(`/tickets/${ticketId}/rfq/queries`, { newQueries: ['Employee census with ages'] })
      .expect(201);
  });

  afterAll(async () => {
    await t?.app.close();
  });

  it('mails the RFQ queries to the RM from the PM mailbox with RM-T01 (manual ticket)', async () => {
    expect(await deliver()).toBe(1);
    const [mail] = (await pm.get(`/tickets/${ticketId}/mails`).expect(200)).body;
    expect(mail).toMatchObject({
      direction: 'outbound',
      templateId: 'RM-T01',
      from: 'pm.e2e@bimakavach.test',
      to: ['rm.mail.e2e@bimakavach.test'],
      threadId: null,
      status: 'sent',
    });
    expect(mail.subject).toBe(`[${ticketNo}] Information needed before float - E2E Mail Trail Pvt Ltd`);
    expect(mail.bodyHtml).toContain('Employee census with ages');
  });

  it('floats with INS-T01 to every POC in To, ticket + thread ref in the subject, link in the body', async () => {
    const [query] = await ds.query(
      `SELECT q.id FROM rfq_queries q JOIN rfq_versions v ON v.id = q.rfq_version_id WHERE v.ticket_id = $1`,
      [ticketId],
    );
    await pm.post(`/dev/tickets/${ticketId}/rm-reply`, { text: 'Census attached' }).expect(201);
    await pm.post(`/tickets/${ticketId}/rfq/queries/${query.id}/resolve`).expect(201);
    await pm.post(`/tickets/${ticketId}/rfq/validate`).expect(201);
    await pm.put(`/tickets/${ticketId}/panel`, { insurerId, branchId, selected: true }).expect(200);
    await pm.post(`/tickets/${ticketId}/rfq/float`).expect(201);
    await deliver();

    const mails = (await pm.get(`/tickets/${ticketId}/mails`).expect(200)).body;
    const float = mails.find((m: { templateId: string }) => m.templateId === 'INS-T01');
    expect(float).toMatchObject({
      direction: 'outbound',
      threadRef: 'TH-01',
      insurerName: 'E2E Mail Insurer',
      from: 'pm.e2e@bimakavach.test',
      rfqLinkInBody: true,
    });
    expect(float.to.sort()).toEqual(['asha@insurer.example.test', 'vikram@insurer.example.test']);
    expect(float.cc).toEqual(['boss@insurer.example.test']); // POC CC copied; a POC already in To is not
    const sentFloat = sendSpy.mock.calls.map(([m]) => m).find((m) => m.subject === float.subject);
    expect(sentFloat.cc).toEqual(['boss@insurer.example.test']);
    expect(float.subject).toBe(
      `[${ticketNo} | TH-01] RFQ - E2E Mail Trail Pvt Ltd - ${PRODUCT_TYPES_SEED.find((p) => p.code === 'GMC')!.label}`,
    );
    expect(float.bodyHtml).toContain('https://example.test/rfq/e2e-mail');
    expect(float.bodyHtml).not.toContain('{{');
  });

  it('is idempotent per outbox event: redelivery sends nothing new', async () => {
    const before = (await pm.get(`/tickets/${ticketId}/mails`).expect(200)).body.length;
    await deliver();
    expect((await pm.get(`/tickets/${ticketId}/mails`).expect(200)).body).toHaveLength(before);
  });

  it('shows the insurer reply as inbound mail on the thread with the quote attached', async () => {
    const [thread] = (await pm.get(`/tickets/${ticketId}/threads`).expect(200)).body;
    await pm.post(`/dev/tickets/${ticketId}/threads/${thread.id}/insurer`, { kind: 'quote' }).expect(201);
    const [latest] = (await pm.get(`/tickets/${ticketId}/mails`).expect(200)).body;
    expect(latest).toMatchObject({
      direction: 'inbound',
      threadRef: 'TH-01',
      from: 'asha@insurer.example.test',
      to: ['pm.e2e@bimakavach.test'],
      status: 'received',
    });
    expect(latest.attachments[0].fileName).toMatch(/\.pdf$/);
  });

  it('the first float mail starts the conversation, the follow-up continues it', async () => {
    const [thread] = (await pm.get(`/tickets/${ticketId}/threads`).expect(200)).body;
    const floatCall = sendSpy.mock.calls
      .map(([m]) => m)
      .find((m) => m.conversation?.ref === `${ticketNo}/TH-01`);
    expect(floatCall.conversation).toEqual({ ref: `${ticketNo}/TH-01` });
    expect(floatCall.idempotencyKey).toEqual(expect.any(String));
    const [floatRow] = await ds.query(
      `SELECT provider_message_id, conversation_ref FROM mail_messages WHERE outbox_id = $1`,
      [floatCall.idempotencyKey],
    );
    expect(floatRow.conversation_ref).toBe(`${ticketNo}/TH-01`);

    sendSpy.mockClear();
    await pm.post(`/tickets/${ticketId}/threads/${thread.id}/follow-up`, {}).expect(201);
    await deliver();
    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy.mock.calls[0][0].cc).toEqual(['boss@insurer.example.test']); // every thread mail, not only the float
    expect(sendSpy.mock.calls[0][0].conversation).toEqual({
      ref: `${ticketNo}/TH-01`,
      replyToMessageId: floatRow.provider_message_id,
    });
  });

  it('a mailbox that is not connected fails the mail once, notifies the owner, no retry', async () => {
    sendSpy.mockClear();
    sendSpy.mockRejectedValueOnce(new MailboxNotConnectedError('pm.e2e@bimakavach.test'));
    const [{ n: before }] = await ds.query(
      `SELECT count(*)::int AS n FROM mail_messages WHERE ticket_id = $1`,
      [ticketId],
    );
    const [{ id: outboxId }] = await ds.query(
      `INSERT INTO outbox_events (destination, event_type, aggregate_type, aggregate_id, payload)
       VALUES ('mail', 'mail.rm_queries', 'ticket', $1, $2) RETURNING id`,
      [ticketId, JSON.stringify({ ticketId, queryIds: [], message: 'Please resend' })],
    );
    const job = { outboxId, eventType: 'mail.rm_queries', ticketId, message: 'Please resend' };
    await expect(t.app.get(MailOutboundHandler).handle('mail.rm_queries', job)).resolves.toBeUndefined();
    await t.app.get(MailOutboundHandler).handle('mail.rm_queries', job); // redelivery: no second attempt
    expect(sendSpy).toHaveBeenCalledTimes(1);

    const [row] = await ds.query(
      `SELECT status, error, conversation_ref FROM mail_messages WHERE outbox_id = $1`,
      [outboxId],
    );
    expect(row).toMatchObject({ status: 'failed', conversation_ref: `${ticketNo}/RM` });
    expect(row.error).toContain('pm.e2e@bimakavach.test');
    const [{ n: after }] = await ds.query(
      `SELECT count(*)::int AS n FROM mail_messages WHERE ticket_id = $1`,
      [ticketId],
    );
    expect(after).toBe(before + 1);
    const notes = await ds.query(
      `SELECT id FROM outbox_events WHERE destination = 'notification' AND event_type = 'mail.mailbox_not_connected' AND aggregate_id = $1`,
      [ticketId],
    );
    expect(notes).toHaveLength(1);
  });

  it('Resend sends a failed mail again as a new mail on the same conversation; the failed row stays (I8)', async () => {
    const [failed] = await ds.query(
      `SELECT id, outbox_id, conversation_ref FROM mail_messages WHERE ticket_id = $1 AND status = 'failed'`,
      [ticketId],
    );
    const view = (await pm.get(`/tickets/${ticketId}/mails`).expect(200)).body.find(
      (m: { id: string }) => m.id === failed.id,
    );
    expect(view).toMatchObject({ status: 'failed', resent: false, error: expect.stringContaining('pm.e2e') });

    // another PM (not the owner) cannot; a mail that was sent cannot be resent
    const otherPm = as(t, 'pm2.e2e@bimakavach.test|E2E Other PM|placement_manager');
    await otherPm.post(`/tickets/${ticketId}/mails/${failed.id}/resend`).expect(403);
    const [sent] = await ds.query(
      `SELECT id FROM mail_messages WHERE ticket_id = $1 AND status = 'sent' AND direction = 'outbound' LIMIT 1`,
      [ticketId],
    );
    await pm.post(`/tickets/${ticketId}/mails/${sent.id}/resend`).expect(422);

    sendSpy.mockClear();
    await pm.post(`/tickets/${ticketId}/mails/${failed.id}/resend`).expect(201);
    await pm.post(`/tickets/${ticketId}/mails/${failed.id}/resend`).expect(409); // once per failed mail
    const [event] = await ds.query(
      `SELECT id, event_type, payload FROM outbox_events WHERE destination = 'mail' AND payload->>'resendOf' = $1`,
      [failed.id],
    );
    expect(event.event_type).toBe('mail.rm_queries');
    expect(event.payload).toMatchObject({ message: 'Please resend', resendOf: failed.id });

    const [latestSent] = await ds.query(
      `SELECT provider_message_id FROM mail_messages
        WHERE conversation_ref = $1 AND provider_message_id IS NOT NULL ORDER BY at DESC LIMIT 1`,
      [failed.conversation_ref],
    );
    await deliver();
    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy.mock.calls[0][0]).toMatchObject({
      idempotencyKey: event.id,
      conversation: { ref: failed.conversation_ref, replyToMessageId: latestSent.provider_message_id },
    });
    const rows = await ds.query(`SELECT id, status FROM mail_messages WHERE outbox_id = ANY($1)`, [
      [failed.outbox_id, event.id],
    ]);
    expect(rows.find((r: { id: string }) => r.id === failed.id).status).toBe('failed');
    expect(rows.find((r: { id: string }) => r.id !== failed.id).status).toBe('sent');
    const after = (await pm.get(`/tickets/${ticketId}/mails`).expect(200)).body.find(
      (m: { id: string }) => m.id === failed.id,
    );
    expect(after.resent).toBe(true);
    const audit = (await pm.get(`/tickets/${ticketId}/audit`).expect(200)).body.map(
      (a: { event: string }) => a.event,
    );
    expect(audit).toContain('Mail resent');
  });

  it('a mail Gmail refuses (SEND_REJECTED) is stored failed once and notifies the owner', async () => {
    sendSpy.mockClear();
    sendSpy.mockRejectedValueOnce(new MailRejectedError('Gmail 400: Invalid To header'));
    const [{ id: outboxId }] = await ds.query(
      `INSERT INTO outbox_events (destination, event_type, aggregate_type, aggregate_id, payload)
       VALUES ('mail', 'mail.rm_queries', 'ticket', $1, $2) RETURNING id`,
      [ticketId, JSON.stringify({ ticketId, queryIds: [], message: 'Bad address' })],
    );
    const job = { outboxId, eventType: 'mail.rm_queries', ticketId, message: 'Bad address' };
    await t.app.get(MailOutboundHandler).handle('mail.rm_queries', job);
    await t.app.get(MailOutboundHandler).handle('mail.rm_queries', job);
    expect(sendSpy).toHaveBeenCalledTimes(1);
    const [row] = await ds.query(`SELECT status, error FROM mail_messages WHERE outbox_id = $1`, [outboxId]);
    expect(row.status).toBe('failed');
    expect(row.error).toContain('Invalid To header');
    const notes = await ds.query(
      `SELECT id FROM outbox_events WHERE destination = 'notification' AND event_type = 'mail.send_rejected' AND aggregate_id = $1`,
      [ticketId],
    );
    expect(notes).toHaveLength(1);
  });

  it('lists BimaSetu messages separately (none for a manual ticket)', async () => {
    expect((await pm.get(`/tickets/${ticketId}/bimasetu-messages`).expect(200)).body).toEqual([]);
  });
});
