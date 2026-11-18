/**
 * DEMO MODE ONLY (NEXT_PUBLIC_DEMO=true): serves /api/v1 from fixtures captured from a real API run,
 * with a few in-memory mutations so the RFQ tab and Create Ticket can be clicked through.
 * Used to publish a static preview of the UI. Never bundled into the real build path.
 */
import fixtures from './fixtures.json';

type Json = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const db: { tickets: Json[]; sub: Record<string, Json> } = JSON.parse(JSON.stringify(fixtures));
const now = () => new Date().toISOString();
const ok = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const clock = (slaId: string, ownerType: 'internal' | 'external', mins: number) => ({
  slaId,
  ownerType,
  targetMins: mins,
  anchorAt: now(),
  remainingMins: mins,
  breached: false,
  dueAt: new Date(Date.now() + mins * 60_000).toISOString(),
});
const fail = (message: string, status = 422) =>
  ok({ statusCode: status, code: 'GUARD_FAILED', message }, status);
const audit = (id: string, event: string, detail = '') =>
  (db.sub[`${id}/audit`] ??= []).unshift({
    id: crypto.randomUUID(),
    actorName: 'Himani Doshi',
    actorType: 'Head',
    event,
    detail,
    at: now(),
  });

function route(method: string, path: string, query: URLSearchParams, body: Json): Response {
  if (method === 'GET' && path === '/tickets') {
    const tab = query.get('tab') ?? 'mine';
    let items = db.tickets;
    if (tab !== 'all') items = items.filter((t) => t.stage !== 'closed');
    if (tab === 'action' || tab === 'sla') items = items.filter((t) => t.sla?.ownerType === 'internal');
    if (tab === 'sla') items = items.filter((t) => t.sla.remainingMins !== null && t.sla.remainingMins < 60);
    return ok({ items, total: items.length, page: 1, pageSize: 50 });
  }
  let m = path.match(/^\/tickets\/by-no\/(.+)$/);
  if (m) {
    const t = db.tickets.find((x) => x.ticketNo === m![1]);
    return t ? ok(t) : fail('Ticket not found', 404);
  }
  if (method === 'POST' && path === '/tickets') {
    const seq = 1001 + db.tickets.length;
    const me = { id: 'demo-head', name: 'Himani Doshi', avatarUrl: null };
    const t = {
      ...db.tickets[db.tickets.length - 1],
      ...body,
      id: crypto.randomUUID(),
      ticketNo: `PLC-${seq}`,
      stage: 'rfq_review',
      internalStatus: 'Ready for Placement',
      rmStatus: 'Placement In Progress',
      riskTier: null,
      sla: clock('SLA-02', 'internal', 60),
      receivedAt: now(),
      channel: 'manual',
      rm: { id: body.rmUserId ?? '', name: 'Shubh Bangar', avatarUrl: null },
      owner: me,
      createdBy: me,
      targetPremium: body.targetPremium ?? null,
      usableQuoteCount: 0,
      mandateState: 'none',
      outcome: null,
      escalated: false,
      panelLocked: false,
      followUpsStopped: false,
      activeRfqVersion: 1,
      qcrRound: 1,
      nextAction: {
        label: 'Review the RFQ - raise any queries to the RM, or validate',
        tab: 'rfq',
        tone: 'purple',
      },
    };
    db.tickets.unshift(t);
    db.sub[`${t.id}/rfq/versions`] = [
      {
        id: crypto.randomUUID(),
        version: 1,
        status: 'in_review',
        linkUrl: body.rfqLinkUrl,
        excelDocumentId: null,
      },
    ];
    db.sub[`${t.id}/rfq/queries`] = [];
    audit(t.id, 'Ticket created manually', `RFQ V1 · ${body.rfqLinkUrl}`);
    return ok(t, 201);
  }
  m = path.match(/^\/tickets\/([^/]+)\/(.+)$/);
  if (m) {
    const [, id, rest] = m;
    const t = db.tickets.find((x) => x.id === id);
    if (!t) return fail('Ticket not found', 404);
    if (method === 'GET') return ok(db.sub[`${id}/${rest}`] ?? []);
    if (rest === 'rfq/risk-tier') {
      t.riskTier = body.value;
      audit(id, 'Risk tier set', body.value);
      return ok(t);
    }
    if (rest === 'rfq/queries') {
      const qs = (db.sub[`${id}/rfq/queries`] ??= []);
      for (const label of body.newQueries ?? [])
        qs.push({
          id: crypto.randomUUID(),
          ref: `Q-${String(qs.length + 1).padStart(2, '0')}`,
          label,
          resolved: false,
          answer: null,
        });
      Object.assign(t, {
        stage: 'awaiting_rm',
        internalStatus: 'RFQ Clarification Required',
        rmStatus: 'Action Required',
        sla: clock('SLA-03', 'external', 540),
        nextAction: { label: 'Waiting on RM response', tab: 'rfq', tone: 'orange' },
      });
      audit(id, 'Query mail sent to RM', (body.newQueries ?? []).join('; '));
      return ok(qs);
    }
    const r = rest.match(/^rfq\/queries\/([^/]+)\/resolve$/);
    if (r) {
      if (t.stage !== 'rfq_review') return fail('Queries can be resolved only in RFQ Review');
      const q = (db.sub[`${id}/rfq/queries`] ?? []).find((x: Json) => x.id === r[1]);
      if (q) q.resolved = true;
      audit(id, 'Query resolved', q?.label ?? '');
      return ok(q);
    }
    if (rest === 'rfq/validate') {
      if (!t.riskTier) return fail('Set the risk tier to validate');
      if ((db.sub[`${id}/rfq/queries`] ?? []).some((q: Json) => !q.resolved))
        return fail('Queries still open');
      Object.assign(t, {
        stage: 'insurer_selection',
        internalStatus: 'Insurer Selection Pending',
        sla: clock('SLA-04', 'internal', 120),
        nextAction: { label: 'Select insurers and send the RFQ', tab: 'insurers', tone: 'purple' },
      });
      audit(id, `RFQ V${t.activeRfqVersion} validated`, 'Moved to insurer selection');
      return ok(t);
    }
    return fail('Not available in the demo', 501);
  }
  if (method === 'GET' && path === '/insurers') return ok((fixtures as Json).insurers ?? []);
  if (method === 'GET' && path === '/me')
    return ok({
      id: 'demo-head',
      name: 'Himani Doshi',
      email: 'himani@bimakavach.com',
      roles: ['placement_head'],
      avatarUrl: null,
    });
  return ok({});
}

export function installMockApi(base: string) {
  const real = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url,
      location.href,
    );
    if (!url.pathname.startsWith(base)) return real(input, init);
    await new Promise((r) => setTimeout(r, 120));
    const body = init?.body && typeof init.body === 'string' ? JSON.parse(init.body) : {};
    return route(
      (init?.method ?? 'GET').toUpperCase(),
      url.pathname.slice(base.length),
      url.searchParams,
      body,
    );
  };
}
