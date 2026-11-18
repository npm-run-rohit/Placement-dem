import { CheckCircle2, FileText, Info } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { InboundMailView, ReviewTicketOption, ThreadView } from '@bimaplacement/contracts';
import { useReviewCounts } from '@/api/hooks';
import { Button, Chip, FilterPills } from '@/design-system/components';
import { PageHead } from '@/shell/PageHead';
import { api, openDocument } from '@/lib/api-client';
import { fmtWhen } from '@/lib/format';
import { DevSimBlock, DevSimBtn, useDevAction } from '@/dev/DevTools';

type Queue = 'my_reviews' | 'unmatched';
const CLASSES = ['Quote Received', 'Clarification Required', 'Declined', 'Not Applicable'] as const;

/** Manual Review (UI-SPEC 3.4, FR-227..231): inbound insurer mail the bot would not apply alone. */
export function ManualReviewPage() {
  const [queue, setQueue] = useState<Queue>('my_reviews');
  const { data: counts } = useReviewCounts();
  const { data: mails = [], isLoading } = useQuery({
    queryKey: ['manual-review', queue],
    queryFn: () => api<InboundMailView[]>(`/manual-review?queue=${queue}`),
  });
  return (
    <div className="px-6 py-6">
      <PageHead
        title="Manual Review Queue"
        hint="Nothing here has updated a ticket automatically."
        right={
          <FilterPills<Queue>
            value={queue}
            onChange={setQueue}
            items={[
              { key: 'my_reviews', label: 'My reviews', count: counts?.myReviews },
              { key: 'unmatched', label: 'Unmatched', count: counts?.unmatched },
            ]}
          />
        }
      />
      <InboundSim />
      {isLoading && <div className="text-dense text-ink-2">Loading…</div>}
      {!isLoading && !mails.length && (
        <div className="rounded-xl border border-dashed border-line bg-card-alt p-6 text-center text-dense text-ink-2">
          {queue === 'my_reviews' ? 'No mail waiting for your review.' : 'No unmatched mail.'}
        </div>
      )}
      <div className="flex flex-col gap-4">
        {mails.map((m) => (
          <MailCard key={m.id} mail={m} />
        ))}
      </div>
    </div>
  );
}

function MailCard({ mail: m }: { mail: InboundMailView }) {
  const done = m.status !== 'pending';
  return (
    <article className="overflow-hidden rounded-xl border-[0.5px] border-line bg-white">
      <header className="flex flex-wrap items-center gap-3 bg-card-alt px-4 py-2.5">
        {m.ticket && (
          <span className="num font-mono text-dense font-semibold text-brand">{m.ticket.ticketNo}</span>
        )}
        {m.thread && (
          <span className="text-dense font-semibold text-ink">
            {m.thread.insurerName} · {m.thread.threadRef}
          </span>
        )}
        <Chip tone={m.queue === 'my_reviews' ? 'amber' : m.unknownSender ? 'amber' : 'orange'}>
          {m.reason ?? 'Review'}
        </Chip>
        <span className="num ml-auto font-mono text-meta text-ink-2">{fmtWhen(m.receivedAt)}</span>
      </header>
      <div className="space-y-3 p-4">
        <div>
          <div className="text-[12.5px] font-semibold text-ink">{m.subject}</div>
          <div className="text-meta text-ink-3">from {m.from}</div>
        </div>
        <div className="whitespace-pre-wrap rounded-lg bg-canvas p-3 text-dense text-ink-2">
          {m.bodyText || '(no text)'}
        </div>
        {m.attachments.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {m.attachments.map((a) => (
              <button
                key={a.id}
                onClick={() => openDocument(a.id, 'view')}
                className="inline-flex items-center gap-1.5 rounded-full border-[0.5px] border-line bg-card-alt px-2.5 py-1 text-meta text-ink-2 hover:border-brand hover:text-brand"
              >
                <FileText size={12} /> {a.fileName}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-start gap-1.5 text-meta text-ink-3">
          <Info size={13} className="mt-px shrink-0" />
          <span>
            {m.classification
              ? `The bot read this as ${m.classification}${m.confidence != null ? ` (${Math.round(m.confidence * 100)}% sure)` : ''}. `
              : ''}
            {m.mappingBasis
              ? `Mapped by ${m.mappingBasis.replace('-', ' ')}.`
              : 'No ticket or thread reference found.'}
            {m.matchedProducts.length ? ` Mentions ${m.matchedProducts.join(', ')}.` : ''}
          </span>
        </div>
        {done ? (
          <div className="flex items-center gap-1.5 text-dense font-medium text-t-green">
            <CheckCircle2 size={15} /> Confirmed as {m.appliedClass} - applied to the thread
            {m.reviewedBy ? ` · ${m.reviewedBy}` : ''}
          </div>
        ) : m.queue === 'unmatched' ? (
          <MapControls mail={m} />
        ) : (
          <ClassifyControls mail={m} />
        )}
      </div>
    </article>
  );
}

function useReviewAction<T>(path: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: T) => api<InboundMailView>(path, { method: 'POST', json: body }),
    onSuccess: () => qc.invalidateQueries(),
  });
}

function ClassifyControls({ mail: m }: { mail: InboundMailView }) {
  const navigate = useNavigate();
  const [label, setLabel] = useState<string>(
    CLASSES.includes(m.classification as (typeof CLASSES)[number]) ? m.classification! : 'Quote Received',
  );
  const confirm = useReviewAction<{ label: string }>(`/manual-review/${m.id}/classification`);
  return (
    <div className="space-y-3">
      <FilterPills value={label} onChange={setLabel} items={CLASSES.map((c) => ({ key: c, label: c }))} />
      {confirm.error && <div className="text-meta text-t-red">{(confirm.error as Error).message}</div>}
      <div className="flex gap-2">
        <Button
          variant="primary"
          size="sm"
          disabled={confirm.isPending}
          onClick={() => confirm.mutate({ label })}
        >
          Confirm Classification
        </Button>
        {m.ticket && (
          <Button size="sm" onClick={() => navigate(`/tickets/${m.ticket!.ticketNo}/threads`)}>
            Open Thread
          </Button>
        )}
      </div>
    </div>
  );
}

function MapControls({ mail: m }: { mail: InboundMailView }) {
  const [ticketId, setTicketId] = useState(m.ticket?.id ?? '');
  const [threadId, setThreadId] = useState(m.thread?.id ?? '');
  const { data: options = [] } = useQuery({
    queryKey: ['manual-review', m.id, 'ticket-options'],
    queryFn: () => api<ReviewTicketOption[]>(`/manual-review/${m.id}/ticket-options`),
  });
  const { data: threads = [] } = useQuery({
    enabled: !!ticketId,
    queryKey: ['ticket', ticketId, 'threads'],
    queryFn: () => api<ThreadView[]>(`/tickets/${ticketId}/threads`),
  });
  const confirm = useReviewAction<{ ticketId: string; threadId: string }>(`/manual-review/${m.id}/mapping`);
  const select =
    'h-9 rounded-lg border-[0.5px] border-line bg-white px-2 text-dense text-ink outline-none focus:border-brand disabled:opacity-50';
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Placement Ticket"
          className={`${select} w-[300px]`}
          value={ticketId}
          onChange={(e) => (setTicketId(e.target.value), setThreadId(''))}
        >
          <option value="">Placement Ticket…</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.ticketNo} · {o.businessName}
              {o.matches ? ` · matches ${o.productType}` : ''}
            </option>
          ))}
        </select>
        <select
          aria-label="Insurer thread"
          className={`${select} w-[240px]`}
          value={threadId}
          disabled={!ticketId}
          onChange={(e) => setThreadId(e.target.value)}
        >
          <option value="">Insurer thread…</option>
          {threads.map((th) => (
            <option key={th.id} value={th.id}>
              {th.threadRef} · {th.insurer.name}
              {th.branch.name ? ` · ${th.branch.name}` : ''}
            </option>
          ))}
        </select>
        <Button
          variant="primary"
          size="sm"
          disabled={!ticketId || !threadId || confirm.isPending}
          onClick={() => confirm.mutate({ ticketId, threadId })}
        >
          Confirm Mapping
        </Button>
      </div>
      {ticketId && !threads.length && (
        <div className="text-meta text-ink-3">This ticket has no insurer threads yet.</div>
      )}
      {confirm.error && <div className="text-meta text-t-red">{(confirm.error as Error).message}</div>}
    </div>
  );
}

/** Stand-in for insurer mail with no ticket reference: lands in Unmatched for someone to map. Dev only. */
function InboundSim() {
  const mail = useDevAction('/dev/mail/inbound');
  return (
    <DevSimBlock title="Simulate inbound insurer mail">
      <DevSimBtn
        disabled={mail.isPending}
        onClick={() =>
          mail.mutate({
            from: 'underwriting@unknown-insurer.example.test',
            subject: 'GMC terms for your client',
            textBody: 'Please find our GMC terms attached.',
            attachmentName: 'GMC_Quotation.pdf',
          })
        }
      >
        Unmatched quote mail
      </DevSimBtn>
    </DevSimBlock>
  );
}
