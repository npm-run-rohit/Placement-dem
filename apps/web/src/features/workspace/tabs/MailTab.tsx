import { Paperclip, Search, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Channel, type BimaSetuMessageView, type MailView, type ThreadView } from '@bimaplacement/contracts';
import { Avatar, FilterPills } from '@/design-system/components';
import { useTicketSub } from '@/api/hooks';
import { openDocument } from '@/lib/api-client';
import { fmtWhen } from '@/lib/format';
import { TabHeader } from './TabHeader';
import type { TabProps } from '../TicketWorkspace';

type View = 'mail' | 'bimasetu';

/** Mail Trail (UI-SPEC 3.3.9, PLAN 2.13): stored mail per party (RM + one pill per thread) and the BimaSetu message log. */
export function MailTab({ ticket: t }: TabProps) {
  const [view, setView] = useState<View>('mail');
  return (
    <div>
      <TabHeader
        title="Mail Trail"
        meta={
          <FilterPills<View>
            value={view}
            onChange={setView}
            items={[
              { key: 'mail', label: 'Mail' },
              { key: 'bimasetu', label: 'BimaSetu' },
            ]}
          />
        }
      />
      {view === 'mail' ? <MailList ticket={t} /> : <BimaSetuList ticket={t} />}
    </div>
  );
}

function MailList({ ticket: t }: TabProps) {
  const { data: mails = [], isLoading } = useTicketSub<MailView[]>(t.id, 'mails');
  const { data: threads = [] } = useTicketSub<ThreadView[]>(t.id, 'threads');
  const [party, setParty] = useState<string>('rm');
  const [q, setQ] = useState('');

  const pills = useMemo(
    () => [
      { key: 'rm', label: 'RM', count: mails.filter((m) => !m.threadId).length },
      ...threads.map((th) => ({
        key: th.id,
        label: [
          th.insurer.name.split(' ')[0],
          th.multiBranch && th.branch.name ? th.branch.name.split(' ')[0] : null,
        ]
          .filter(Boolean)
          .join(' · '),
        count: mails.filter((m) => m.threadId === th.id).length,
      })),
    ],
    [mails, threads],
  );
  const needle = q.trim().toLowerCase();
  const shown = mails
    .filter((m) => (party === 'rm' ? !m.threadId : m.threadId === party))
    .filter(
      (m) =>
        !needle ||
        [
          m.from,
          m.subject,
          m.bodyHtml.replace(/<[^>]+>/g, ' '),
          ...m.to,
          ...m.attachments.map((a) => a.fileName),
        ].some((s) => s.toLowerCase().includes(needle)),
    );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <FilterPills value={party} onChange={setParty} items={pills} />
        <label className="flex h-9 w-80 items-center gap-2 rounded-lg border-[0.5px] border-line bg-white px-3 text-dense">
          <Search size={14} className="text-ink-3" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search sender, subject, body or attachment name"
            className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-ink-3"
          />
          {q && (
            <button onClick={() => setQ('')} aria-label="Clear search">
              <X size={14} className="text-ink-3" />
            </button>
          )}
        </label>
      </div>
      {isLoading && <div className="text-dense text-ink-2">Loading…</div>}
      {!isLoading && !shown.length && (
        <div className="text-dense text-ink-2">
          {needle ? `No mail matches "${q.trim()}".` : 'Nothing on this thread yet.'}
        </div>
      )}
      <ol>
        {shown.map((m) => (
          <li key={m.id} className="flex items-start gap-4 py-4 [&+li]:border-t [&+li]:border-line-soft">
            <Avatar
              name={m.direction === 'outbound' ? 'Placement' : (m.insurerName ?? 'RM')}
              size={40}
              tone={m.direction === 'outbound' ? 'purple' : m.threadId ? 'blue' : 'green'}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-semibold text-ink">
                  {m.direction === 'outbound' ? 'Placement' : (m.insurerName ?? 'RM')}
                </span>
                <span className="num shrink-0 font-mono text-meta text-ink-2">{fmtWhen(m.at)}</span>
              </div>
              <div className="truncate text-meta text-ink-2">
                {m.direction === 'outbound' ? `from ${m.from} to ${m.to.join(', ')}` : `from ${m.from}`}
              </div>
              <div className="mt-1 text-dense font-medium text-ink">{m.subject}</div>
              {/* bodyHtml is escaped server-side (mail handler / inbound recorder) */}
              <div
                className="mt-1 text-dense text-ink-2 [&_p+p]:mt-2"
                dangerouslySetInnerHTML={{ __html: m.bodyHtml }}
              />
              {(m.attachments.length > 0 || m.rfqLinkInBody) && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {m.attachments.map((a) => (
                    <button
                      key={a.id}
                      onClick={() => openDocument(a.id)}
                      className="inline-flex items-center gap-1.5 rounded-full border-[0.5px] border-line bg-card-alt px-2.5 py-1 text-meta text-ink-2 hover:border-brand hover:text-brand"
                    >
                      <Paperclip size={12} /> {a.fileName}
                    </button>
                  ))}
                  {m.rfqLinkInBody && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border-[0.5px] border-line bg-card-alt px-2.5 py-1 text-meta text-ink-2">
                      <Paperclip size={12} /> RFQ link (in mail body)
                    </span>
                  )}
                </div>
              )}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Payload = Record<string, any>;
const BS_SUMMARY: Record<string, (p: Payload) => string> = {
  float: () => 'RFQ floated to Placement',
  query_answer: (p) => `RM answered${p.queryRef ? ` ${p.queryRef}` : ' the queries'}`,
  revision_request: (p) => `Revision requested${p.reason ? `: ${p.reason}` : ''}`,
  client_confirmation: (p) => `Client confirmed${p.insurerName ? ` ${p.insurerName}` : ' an option'}`,
  line_lost: (p) => `Line lost${p.reason ? `: ${p.reason}` : ''}`,
  ticket_created: (p) => `Ticket ${p.ticketNo ?? ''} created`,
  stage_changed: (p) => `Desk stage: ${p.stage ?? ''}`,
  query_raised: (p) => `Queries raised to the RM${Array.isArray(p.queries) ? ` (${p.queries.length})` : ''}`,
  qcr_round: (p) =>
    `QCR round ${p.round ?? ''} sent${Array.isArray(p.rows) ? ` with ${p.rows.length} quote rows` : ''}`,
  closed_no_appetite: () => 'Closed: no appetite',
};

function BimaSetuList({ ticket: t }: TabProps) {
  const { data: rows = [], isLoading } = useTicketSub<BimaSetuMessageView[]>(t.id, 'bimasetu-messages');
  if (t.channel !== Channel.BIMASETU)
    return <div className="text-dense text-ink-2">Manual ticket - nothing is exchanged with BimaSetu.</div>;
  return (
    <div>
      <div className="mb-3 text-sm font-medium text-ink-2">{rows.length} BimaSetu messages</div>
      {isLoading && <div className="text-dense text-ink-2">Loading…</div>}
      {!isLoading && !rows.length && <div className="text-dense text-ink-2">No BimaSetu messages yet.</div>}
      <ol>
        {rows.map((r, i) => (
          <li key={r.id} className="flex items-start gap-3 py-3 [&+li]:border-t [&+li]:border-line-soft">
            <span className="bk-mark mt-1.5 shrink-0" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-ink">
                {r.direction === 'in' ? '← In' : '→ Out'} · {r.type}
              </span>
              <span className="block text-meta font-medium text-ink-3">
                {(BS_SUMMARY[r.type] ?? (() => r.status))(r.payload)}
                {r.lastError ? ` · ${r.lastError}` : ''}
              </span>
            </span>
            <span className="num shrink-0 font-mono text-meta text-ink-2">
              BS-{rows.length - i} · {fmtWhen(r.at)}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
