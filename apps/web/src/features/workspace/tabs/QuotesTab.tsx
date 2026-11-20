import clsx from 'clsx';
import { CheckCircle2, ChevronDown, ChevronRight, Download, FileText, XCircle } from 'lucide-react';
import { useState } from 'react';
import {
  PRODUCT_TYPES_SEED,
  QUOTE_DECISION_META,
  QuoteDecision,
  Stage,
  type QuoteView,
  type TicketDetail,
} from '@bimaplacement/contracts';
import { Button, EmptyState, InsurerMark, Modal, MoneyInput, StatusPill } from '@/design-system/components';
import { toneToInd, type Ind } from '@/design-system/tokens';
import { useTicketCommand, useTicketSub } from '@/api/hooks';
import { openDocument } from '@/lib/api-client';
import { fmtInr, fmtWhen } from '@/lib/format';
import { TabHeader } from './TabHeader';
import type { TabProps } from '../TicketWorkspace';

const FLAG: Record<QuoteView['targetFlag'], Ind> = {
  'Target Met': 'success',
  'Above Target': 'caution',
  'Target Not Available': 'neutral',
};

function decisionPill(q: QuoteView): { label: string; ind: Ind } {
  if (q.decision === null) return { label: 'Awaiting decision', ind: 'caution' }; // the PM has to act
  const m = QUOTE_DECISION_META[q.decision];
  return { label: m.label, ind: toneToInd[m.tone] };
}

/**
 * Quotes (UI-SPEC 3.3.7, PLAN 3.1): stored as received - no extraction (BR). The PM records the premium only
 * (target flag, never blocks) and decides usable / needs clarification / excluded (FR-090/091); usable is
 * blocked while a clarification is open; 3 distinct usable insurers queue the Copycat draft (BR-061).
 */
export function QuotesTab({ ticket: t }: TabProps) {
  const { data: all = [], isLoading } = useTicketSub<QuoteView[]>(t.id, 'quotes');
  const quotes = all
    .filter((q) => q.rfqVersion === t.activeRfqVersion)
    .sort((a, b) => a.insurer.name.localeCompare(b.insurer.name) || b.version - a.version);
  const firstUndecided = quotes.find((q) => q.decision === null)?.id ?? null;
  const [open, setOpen] = useState<string | null | undefined>(undefined);
  const expanded = open === undefined ? firstUndecided : open;
  const usable = new Set(quotes.filter((q) => q.decision === QuoteDecision.USABLE).map((q) => q.insurerId))
    .size;
  const product = PRODUCT_TYPES_SEED.find((p) => p.code === t.productType);

  if (isLoading) return <div className="p-4 text-dense text-ink-2">Loading…</div>;
  return (
    <div>
      <TabHeader
        title="Quotes"
        meta={
          quotes.length
            ? `${quotes.length} quote${quotes.length === 1 ? '' : 's'} on RFQ V${t.activeRfqVersion} · ${usable} usable`
            : 'No quotes yet'
        }
      />
      {!quotes.length && (
        <EmptyState
          icon={<FileText size={20} />}
          title="No quotes yet"
          body="Quotes appear here as insurers respond. Each one needs your decision before it can count toward the QCR threshold."
        />
      )}
      {!!quotes.length && (
        <div className="overflow-hidden rounded-xl border border-line-subtle">
          <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_140px_110px_170px_16px] gap-3 bg-card-sunk px-3 py-2 text-xs font-semibold text-ink-2">
            <span>Insurer & Contact</span>
            <span>Product</span>
            <span>Status</span>
            <span>Received</span>
            <span className="text-right">Premium</span>
            <span />
          </div>
          {quotes.map((q) => {
            const pill = decisionPill(q);
            const isOpen = expanded === q.id;
            return (
              <div
                key={q.id}
                className={clsx(
                  'border-t border-line-soft',
                  q.decision === QuoteDecision.SUPERSEDED && 'opacity-60',
                )}
              >
                <button
                  className="grid w-full grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_140px_110px_170px_16px] items-center gap-3 px-3 py-3 text-left hover:bg-placement-bg"
                  onClick={() => setOpen(isOpen ? null : q.id)}
                  aria-expanded={isOpen}
                >
                  <span className="flex flex-wrap items-center gap-2">
                    <InsurerMark name={q.insurer.name} logoUrl={q.insurer.logoUrl} />
                    {q.multiThread && q.branchName && (
                      <StatusPill ind="neutral" variant="outline">
                        {q.branchName}
                      </StatusPill>
                    )}
                    {q.multiVersion && <StatusPill ind="neutral">V{q.version}</StatusPill>}
                  </span>
                  <span className="truncate text-dense">{product?.label ?? t.productType}</span>
                  <span>
                    <StatusPill ind={pill.ind}>{pill.label}</StatusPill>
                  </span>
                  <span className="num text-meta text-ink-2">{fmtWhen(q.receivedAt)}</span>
                  <span className="flex flex-col items-end gap-1">
                    <span className="num font-mono text-[12.5px] font-650">
                      {q.premium ? fmtInr(q.premium) : '-'}
                    </span>
                    {!!q.premium && <StatusPill ind={FLAG[q.targetFlag]}>{q.targetFlag}</StatusPill>}
                  </span>
                  {isOpen ? (
                    <ChevronDown size={14} className="text-ink-2" />
                  ) : (
                    <ChevronRight size={14} className="text-ink-2" />
                  )}
                </button>
                {isOpen && (
                  <QuoteWorkspace
                    ticket={t}
                    q={q}
                    supersededBy={quotes.find((x) => x.threadId === q.threadId && x.version > q.version)}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function QuoteWorkspace({
  ticket: t,
  q,
  supersededBy,
}: {
  ticket: TicketDetail;
  q: QuoteView;
  supersededBy?: QuoteView;
}) {
  const premium = useTicketCommand<{ premium: number | null }>(t.id, 'PUT', `/quotes/${q.id}/premium`);
  const decide = useTicketCommand<{ decision: string; note?: string }>(
    t.id,
    'POST',
    `/quotes/${q.id}/decision`,
  );
  const [modal, setModal] = useState<'exclude' | 'clarify' | null>(null);
  const closed = t.stage === Stage.CLOSED;
  const superseded = q.decision === QuoteDecision.SUPERSEDED;
  const clarificationOpen = q.decision === QuoteDecision.CLARIFICATION;
  const pill = decisionPill(q);

  return (
    <div className="space-y-3 border-t border-line-soft bg-white px-3 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <InsurerMark name={q.insurer.name} logoUrl={q.insurer.logoUrl} />
        <StatusPill ind="neutral">Quote V{q.version}</StatusPill>
        <StatusPill ind="neutral">RFQ V{q.rfqVersion}</StatusPill>
        {supersededBy && <StatusPill ind="neutral">V{q.version} superseded</StatusPill>}
        <span className="text-meta text-ink-2">
          {q.threadRef} · received {fmtWhen(q.receivedAt)}
        </span>
        <span className="ml-auto">
          <StatusPill ind={pill.ind}>
            {q.decision === null ? 'Awaiting your decision' : pill.label}
          </StatusPill>
        </span>
      </div>

      <div className="rounded-xl border border-line-subtle">
        <div className="flex items-center justify-between border-b border-line-soft px-3 py-2 text-dense">
          <span className="flex items-center gap-1.5 font-medium text-placement">
            <FileText size={14} /> {q.fileName}
          </span>
          <Button size="sm" icon={<Download size={12} />} onClick={() => openDocument(q.documentId)}>
            Download
          </Button>
        </div>
        <div className="space-y-2 bg-card-alt px-6 py-5" aria-hidden>
          <div className="h-3 w-1/3 rounded bg-line-soft" />
          <div className="h-2.5 w-2/3 rounded bg-line-soft" />
          <div className="h-2.5 w-1/2 rounded bg-line-soft" />
          <div className="h-2.5 w-3/5 rounded bg-line-soft" />
        </div>
        <div className="border-t border-line-soft px-3 py-2 text-meta text-ink-2">
          Quotes are stored as received. Open the PDF for the insurer&apos;s terms.
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-[260px_1fr] md:items-end">
        <div>
          <div className="mb-1 text-dense font-medium">Premium (as recorded by you)</div>
          <MoneyInput
            label="Premium"
            value={q.premium}
            disabled={closed || superseded || premium.isPending}
            onCommit={(v) => premium.mutate({ premium: v })}
          />
        </div>
        <div className="flex items-center gap-2 text-meta text-ink-2">
          <StatusPill ind={FLAG[q.targetFlag]}>{q.targetFlag}</StatusPill>
          Blank premium reads as Target Not Available. Every change is logged to the audit trail.
        </div>
      </div>
      {premium.error && <p className="text-dense text-t-red">{premium.error.message}</p>}

      {superseded ? (
        <div className="rounded-lg bg-card-sunk p-2.5 text-meta text-ink-2">
          Superseded by a later revision from the same insurer. Retained for audit; does not count toward the
          threshold.
        </div>
      ) : (
        !closed && (
          <div className="space-y-2 rounded-xl border border-line-subtle bg-card-alt p-3">
            {clarificationOpen && (
              <div className="rounded-lg border border-t-orange-line bg-t-orange-soft p-2 text-meta text-t-orange">
                Clarification sent{q.clarificationText ? `: "${q.clarificationText}"` : ''}. This quote can be
                marked usable once the insurer&apos;s revised quote arrives.
              </div>
            )}
            {q.decision === QuoteDecision.EXCLUDED && q.decisionNote && (
              <div className="text-meta text-ink-2">Excluded: {q.decisionNote}</div>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                variant="danger"
                icon={<XCircle size={14} />}
                disabled={decide.isPending || q.decision === QuoteDecision.EXCLUDED}
                onClick={() => setModal('exclude')}
              >
                Exclude from QCR
              </Button>
              <Button disabled={decide.isPending || clarificationOpen} onClick={() => setModal('clarify')}>
                Needs clarification
              </Button>
              <Button
                variant="success"
                icon={<CheckCircle2 size={14} />}
                disabled={decide.isPending || clarificationOpen || q.decision === QuoteDecision.USABLE}
                title={clarificationOpen ? 'Resolve the open clarification first' : undefined}
                onClick={() => decide.mutate({ decision: 'usable' })}
              >
                Mark usable
              </Button>
            </div>
            {decide.error && <p className="text-dense text-t-red">{decide.error.message}</p>}
          </div>
        )
      )}
      {modal && <DecisionModal ticketId={t.id} q={q} kind={modal} onClose={() => setModal(null)} />}
    </div>
  );
}

function DecisionModal({
  ticketId,
  q,
  kind,
  onClose,
}: {
  ticketId: string;
  q: QuoteView;
  kind: 'exclude' | 'clarify';
  onClose: () => void;
}) {
  const [note, setNote] = useState('');
  const decide = useTicketCommand<{ decision: string; note: string }>(
    ticketId,
    'POST',
    `/quotes/${q.id}/decision`,
  );
  const exclude = kind === 'exclude';
  return (
    <Modal
      title={exclude ? `Exclude ${q.insurer.name} from the QCR` : `Ask ${q.insurer.name} for a clarification`}
      subtitle={
        exclude
          ? 'A reason is required and is kept on the audit trail (FR-091).'
          : 'Mailed to every POC on the thread. The quote can be marked usable once the revised quote arrives.'
      }
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={exclude ? 'danger' : 'primary'}
            disabled={!note.trim() || decide.isPending}
            onClick={() =>
              decide.mutate(
                { decision: exclude ? 'excluded' : 'clarification', note: note.trim() },
                { onSuccess: onClose },
              )
            }
          >
            {exclude ? 'Exclude quote' : 'Send clarification'}
          </Button>
        </>
      }
    >
      <textarea
        className="w-full rounded-lg border border-line px-2.5 py-2 text-dense"
        rows={4}
        placeholder={exclude ? 'Why is this quote excluded?' : 'What should the insurer clarify?'}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      {decide.error && <p className="mt-2 text-dense text-t-red">{decide.error.message}</p>}
    </Modal>
  );
}
