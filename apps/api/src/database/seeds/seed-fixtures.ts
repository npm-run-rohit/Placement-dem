import 'reflect-metadata';
import { Module, type INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { DocumentKind, PRODUCT_TYPES_SEED, Role } from '@bimaplacement/contracts';
import type { AuthUser } from '../../common/auth/auth.types';
import { FIXTURE_TICKETS, type FixtureTicket, type Step, type Who } from './fixtures/tickets';
import insurersFixture from './fixtures/insurers.json';

import { SlaConfigService } from '../../modules/sla/sla-config.service';
/**
 * DEV FIXTURES (PLAN 0.4): mock insurer master + the prototype's 17 tickets, replayed through the real
 * services so stages, statuses, SLA clocks, threads, quotes, QCRs, mandates, audit and outbox are
 * exactly what the app would produce. Run on a migrated + seeded database with no tickets:
 *   npm run seed:fixtures
 * Never in production. Mock data only - see fixtures/*.
 */

// must be set before the app module is imported (ConfigModule reads env at import time)
process.env.COPYCAT_MOCK_DELAY_MS = '0';
process.env.LOG_LEVEL ??= 'warn';

/** mock: insurer logos shipped in apps/web/public/insurers (by fixture code) */
const LOGOS: Record<string, string> = {
  icici: 'icici',
  hdfc: 'hdfc',
  bajaj: 'bajaj',
  tata: 'tata',
  nia: 'new-india',
  digit: 'digit',
  sbi: 'sbi',
  chola: 'chola',
  reliance: 'reliance',
  oriental: 'oriental',
  united: 'united',
};

const PROTO_NOW = Date.parse('2026-08-26T14:00:00+05:30'); // the prototype's engine time
const MONTHS: Record<string, string> = {
  Jan: '01',
  Feb: '02',
  Mar: '03',
  Apr: '04',
  May: '05',
  Jun: '06',
  Jul: '07',
  Aug: '08',
  Sep: '09',
  Oct: '10',
  Nov: '11',
  Dec: '12',
};

const USERS: Record<Who | 'rm', { email: string; name: string; roles: Role[] }> = {
  himani: { email: 'himani@bimakavach.com', name: 'Himani Doshi', roles: [Role.PLACEMENT_HEAD] },
  bhupendra: {
    email: 'bhupendra.solanki@bimakavach.com',
    name: 'Bhupendra Singh',
    roles: [Role.PLACEMENT_MANAGER],
  },
  rm: { email: 'shubh.bangar@bimakavach.com', name: 'Shubh Bangar', roles: [Role.RM] },
};

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Dev fixtures are never loaded in production');
  const { AppModule } = await import('../../app.module');
  const { AutomationModule } = await import('../../modules/automation/automation.module');

  @Module({ imports: [AppModule, AutomationModule] })
  class FixturesModule {}

  const app = await NestFactory.createApplicationContext(FixturesModule, { logger: ['error', 'warn'] });
  try {
    await load(app);
  } finally {
    await app.close();
  }
}

async function load(app: INestApplicationContext) {
  const s = await services(app);
  const ds = app.get(DataSource);
  const [{ n }] = await ds.query(`SELECT count(*)::int AS n FROM placement_tickets`);
  if (n > 0)
    throw new Error(
      `Database already has ${n} tickets - fixtures load only into an empty database (recreate it first)`,
    );

  // DEV FIXTURE - the prototype's 2026 holiday dates (Keka list), so SLA clocks match the prototype. Not PRD data:
  // the real list is pending from the Placement Head (PRD App. C #16) and is never seeded.
  for (const d of [
    '2026-01-01',
    '2026-01-14',
    '2026-01-26',
    '2026-03-04',
    '2026-03-31',
    '2026-05-28',
    '2026-09-14',
    '2026-10-02',
    '2026-10-20',
    '2026-11-09',
    '2026-12-25',
  ]) {
    await ds.query(
      `INSERT INTO holidays(date, name) VALUES ($1, 'Dev fixture holiday') ON CONFLICT DO NOTHING`,
      [d],
    );
  }
  await app.get(SlaConfigService).refresh();

  const users = {} as Record<Who | 'rm', AuthUser>;
  for (const [key, u] of Object.entries(USERS) as Array<[Who | 'rm', (typeof USERS)['rm']]>) {
    const row = await s.users.upsertFromSahayak({
      sahayakUserId: `dev:${u.email}`,
      email: u.email,
      name: u.name,
      roles: u.roles,
    });
    users[key] = {
      id: row.id,
      sahayakUserId: row.sahayakUserId,
      email: row.email,
      name: row.name,
      roles: row.roles,
    };
  }

  const insurerIds = await loadInsurers(ds);
  console.log(`insurers: ${Object.keys(insurerIds).length} (mock master)`);

  for (const fx of FIXTURE_TICKETS) {
    const ticket = await loadTicket(s, users, insurerIds, fx);
    console.log(
      `${ticket.ticketNo} = prototype ${fx.proto}  ${fx.client} · ${fx.product} -> ${ticket.stage}`,
    );
  }

  const sent = await deliverMail(ds, s);
  console.log(`mail trail: ${sent} mails sent from the PM mailboxes (dev mailbox)`);

  s.clock.advance(Date.now() - s.clock.now().getTime()); // back to real time
  await s.sweeper.handle(); // SLA-P1 on anything already breached (escalates the Head's RFQ Review tickets)
  console.log('fixtures loaded');
}

async function services(app: INestApplicationContext) {
  const [
    { Clock },
    { UsersService },
    { TicketsService },
    { RfqService },
    { ThreadsService },
    { QuotesService },
    { QcrService },
    { DecisionsService },
    { MandatesService },
    { DocumentsService },
    { InsurersService },
    { CopycatRunnerHandler },
    { SlaSweeperHandler },
    { MailOutboundHandler },
    { MailTrailService },
    { Actors },
  ] = await Promise.all([
    import('../../common/time/clock'),
    import('../../modules/users/users.service'),
    import('../../modules/tickets/tickets.service'),
    import('../../modules/rfq/rfq.service'),
    import('../../modules/threads/threads.service'),
    import('../../modules/quotes/quotes.service'),
    import('../../modules/qcr/qcr.service'),
    import('../../modules/decisions/decisions.service'),
    import('../../modules/mandates/mandates.service'),
    import('../../modules/documents/documents.service'),
    import('../../modules/insurers/insurers.service'),
    import('../../integrations/copycat/copycat-runner.handler'),
    import('../../modules/automation/sla-sweeper.handler'),
    import('../../modules/communications/mail-outbound.handler'),
    import('../../modules/communications/mail-trail.service'),
    import('../../modules/audit/actor'),
  ]);
  return {
    clock: app.get(Clock),
    users: app.get(UsersService),
    tickets: app.get(TicketsService),
    rfq: app.get(RfqService),
    threads: app.get(ThreadsService),
    quotes: app.get(QuotesService),
    qcr: app.get(QcrService),
    decisions: app.get(DecisionsService),
    mandates: app.get(MandatesService),
    documents: app.get(DocumentsService),
    insurers: app.get(InsurersService),
    copycat: app.get(CopycatRunnerHandler),
    sweeper: app.get(SlaSweeperHandler),
    mail: app.get(MailOutboundHandler),
    mailTrail: app.get(MailTrailService),
    Actors,
  };
}
type Services = Awaited<ReturnType<typeof services>>;

/** Sends the fixture tickets' mail in-process (what the worker's relay would do) so the Mail Trail has data. */
async function deliverMail(ds: DataSource, s: Services): Promise<number> {
  const rows: Array<{
    id: string;
    event_type: string;
    aggregate_id: string;
    created_at: Date;
    payload: Record<string, unknown>;
  }> = await ds.query(
    `SELECT id, event_type, aggregate_id, created_at, payload FROM outbox_events WHERE destination = 'mail' AND published_at IS NULL ORDER BY created_at`,
  );
  for (const r of rows) {
    await s.mail.handle(r.event_type, {
      outboxId: r.id,
      eventType: r.event_type,
      aggregateId: r.aggregate_id,
      occurredAt: r.created_at.toISOString(),
      ...r.payload,
    });
    await ds.query(`UPDATE outbox_events SET published_at = now() WHERE id = $1`, [r.id]);
  }
  return rows.length;
}

/** Insurer master from fixtures/insurers.json; POCs go to every product group the insurer has appetite in. */
async function loadInsurers(ds: DataSource): Promise<Record<string, string>> {
  const ids: Record<string, string> = {};
  for (const ins of insurersFixture.insurers) {
    const [existing] = await ds.query(`SELECT id FROM insurers WHERE code = $1`, [ins.code]);
    if (existing) {
      ids[ins.code] = existing.id;
      continue;
    }
    const [{ id }] = await ds.query(
      `INSERT INTO insurers (code, name, status, appetite, sectors, note, logo_url, row_version) VALUES ($1, $2, $3, $4, $5, $6, $7, 1) RETURNING id`,
      [
        ins.code,
        ins.name,
        ins.status,
        ins.appetite,
        ins.sectors,
        ins.note,
        LOGOS[ins.code] ? `/insurers/${LOGOS[ins.code]}.webp` : null,
      ],
    );
    ids[ins.code] = id;
    const groups = [
      ...new Set(
        ins.appetite.map((code) => PRODUCT_TYPES_SEED.find((p) => p.code === code)?.group).filter(Boolean),
      ),
    ];
    for (const b of ins.branches) {
      const [{ id: branchId }] = await ds.query(
        `INSERT INTO insurer_branches (insurer_id, name, city, status, row_version) VALUES ($1, $2, $3, 'Active', 1) RETURNING id`,
        [id, b.name, b.city],
      );
      for (const group of groups) {
        for (const poc of b.pocs) {
          await ds.query(
            `INSERT INTO insurer_pocs (branch_id, product_group, name, email, row_version) VALUES ($1, $2, $3, $4, 1)`,
            [branchId, group, poc.name, poc.email],
          );
        }
      }
    }
  }
  return ids;
}

/** 'DD Mon, HH:MM' = prototype time shifted so the prototype's engine time is now; 'now-90m' = real clock. */
function when(at: string): Date {
  const rel = /^now-(\d+)m$/.exec(at);
  if (rel) return new Date(Date.now() - Number(rel[1]) * 60_000);
  const m = /^(\d{2}) (\w{3}), (\d{2}):(\d{2})$/.exec(at);
  if (!m) throw new Error(`bad fixture time: ${at}`);
  const proto = Date.parse(`2026-${MONTHS[m[2]]}-${m[1]}T${m[3]}:${m[4]}:00+05:30`);
  return new Date(Date.now() + (proto - PROTO_NOW));
}

async function loadTicket(
  s: Services,
  users: Record<Who | 'rm', AuthUser>,
  insurerIds: Record<string, string>,
  fx: FixtureTicket,
) {
  const at = (t: string) => s.clock.advance(when(t).getTime() - s.clock.now().getTime());
  const actor = users[fx.owner];
  const short = fx.client.split(' ')[0];

  at(fx.received);
  const excel =
    fx.rfq === 'excel'
      ? await s.documents.upload({
          ticketId: null,
          kind: DocumentKind.RFQ_EXCEL,
          fileName: `RFQ_${short}_${fx.product}_V1.xlsx`,
          contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          buffer: Buffer.from('mock rfq'),
          uploadedBy: users.himani.id,
        })
      : null;
  const created = await s.tickets.createManual(users.himani, {
    rfqExcelDocumentId: excel?.id,
    rfqLinkUrl:
      fx.rfq === 'link'
        ? `https://rm.bimakavach.com/rfq/${short.toLowerCase()}-${fx.product.toLowerCase()}`
        : undefined,
    businessName: fx.client,
    industryType: fx.industry,
    productType: fx.product,
    businessType: fx.businessType,
    renewalDate: fx.renewal,
    incumbentInsurer: fx.incumbent,
    rmUserId: users.rm.id,
    clientSpoc: fx.spoc,
    urgency: fx.urgency,
    targetPremium: fx.target ?? undefined,
    ownerId: actor.id,
  });
  const id = created.id;
  let queryRefs: string[] = [];
  const thread = async (code: string) => {
    const t = (await s.threads.list(id)).find((x) => x.insurerId === insurerIds[code]);
    if (!t) throw new Error(`${fx.proto}: no thread for ${code}`);
    return t;
  };
  const insurerName = (code: string) => insurersFixture.insurers.find((i) => i.code === code)!.name;
  const qcrs = async () => s.qcr.list(id);

  for (const step of fx.steps as Step[]) {
    at(step.at);
    switch (step.do) {
      case 'queries':
        queryRefs = (
          await s.rfq.raiseQueries(actor, id, step.queries, 'Please help with the points below.')
        ).map((q: { ref: string }) => q.ref);
        break;
      case 'rmAnswer':
        await s.rfq.recordRmAnswer(s.Actors.rm(USERS.rm.name), id, {
          queryRef: queryRefs[step.query],
          text: step.text,
          answeredBy: USERS.rm.name,
        });
        break;
      case 'validate':
        await s.rfq.setRiskTier(actor, id, step.tier);
        await s.rfq.validate(actor, id);
        break;
      case 'incumbentMandate': {
        const proof = await s.documents.upload({
          ticketId: id,
          kind: DocumentKind.MANDATE_PROOF,
          fileName: `Incumbent_Approach_Mandate_${short}.pdf`,
          contentType: 'application/pdf',
          buffer: Buffer.from('%PDF-1.4 mock mandate'),
          uploadedBy: actor.id,
        });
        await s.mandates.recordIncumbentMandate(actor, id, proof.id);
        break;
      }
      case 'panel': {
        const entities = await s.insurers.entitiesForTicket(id);
        for (const code of step.insurers) {
          const e = entities.find((x) => x.insurerId === insurerIds[code]);
          if (!e) throw new Error(`${fx.proto}: ${code} is not selectable`);
          await s.threads.togglePanelEntity(actor, id, e.insurerId, e.branchId, true);
        }
        break;
      }
      case 'float':
        await s.threads.floatRfq(actor, id);
        break;
      case 'insurer': {
        const t = await thread(step.insurer);
        await s.threads.applyInsurerEvent(s.Actors.insurer(insurerName(step.insurer)), id, t.id, step.kind, {
          text: step.text,
        });
        await s.mailTrail.recordInsurerReply(id, t.id, step.text, { at: s.clock.now() });
        break;
      }
      case 'hold':
        await s.threads.holdForRm(actor, id, (await thread(step.insurer)).id, step.request);
        break;
      case 'quote': {
        const t = await thread(step.insurer);
        const version = (await s.quotes.list(id)).filter((q) => q.threadId === t.id).length + 1;
        const doc = await s.documents.upload({
          ticketId: id,
          kind: DocumentKind.QUOTE,
          fileName: `${insurerName(step.insurer).split(' ')[0]}_${fx.product}_Quote_v${version}.pdf`,
          contentType: 'application/pdf',
          buffer: Buffer.from(`%PDF-1.4 mock quote ${step.insurer} v${version}`),
          uploadedBy: `insurer:${step.insurer}`,
        });
        const q = await s.quotes.ingestQuote(s.Actors.insurer(insurerName(step.insurer)), id, t.id, {
          documentId: doc.id,
        });
        if (!q) throw new Error(`${fx.proto}: quote ignored`);
        await s.mailTrail.recordInsurerReply(id, t.id, 'Please find our quotation attached.', {
          attachmentDocumentIds: [doc.id],
          at: s.clock.now(),
        });
        await s.quotes.setPremium(actor, id, q.id, step.premium);
        if (step.usable) await s.quotes.decide(actor, id, q.id, 'usable');
        break;
      }
      case 'copycat': {
        const draft = (await qcrs()).find((q) => q.status === 'draft');
        if (!draft?.copycatRequestId) throw new Error(`${fx.proto}: no Copycat draft`);
        await s.copycat.handle('copycat.generate', { requestId: draft.copycatRequestId });
        break;
      }
      case 'release': {
        const draft = (await qcrs()).find((q) => q.status === 'draft');
        if (!draft) throw new Error(`${fx.proto}: no draft QCR`);
        await s.qcr.setRowsChecked(actor, id, draft.id, true);
        await s.qcr.release(actor, id, draft.id, step.note);
        break;
      }
      case 'select': {
        const released = (await qcrs())
          .filter((q) => q.status === 'released')
          .sort((a, b) => b.version - a.version)[0];
        const row = (await s.qcr.rowsOf(id, released.id)).find(
          (r: { insurerId: string }) => r.insurerId === insurerIds[step.insurer],
        );
        if (!row) throw new Error(`${fx.proto}: no QCR row for ${step.insurer}`);
        await s.decisions.logClientDecision(actor, id, 'quote_selected', { qcrRowId: row.id });
        break;
      }
      case 'noAppetite':
        await s.decisions.closeNoAppetite(actor, id, step.reason);
        break;
      case 'mandateRequest':
        await s.mandates.request(users[step.by], id, {
          reason: step.reason,
          preferredInsurerId: step.preferred ? insurerIds[step.preferred] : undefined,
          message: step.message,
        });
        break;
      case 'mandateRemind':
        await s.mandates.remind(users[step.by], id);
        break;
      case 'mandateResponse':
        await s.mandates.recordResponse(actor, id, { kind: step.kind, note: step.note });
        break;
    }
  }
  return s.tickets.get(users.himani, id);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
