import clsx from 'clsx';
import { AlertTriangle, CheckCircle2, ChevronDown, Lock, Send, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Channel,
  CopycatStatus,
  QcrSource,
  QcrStatus,
  QuoteDecision,
  Stage,
  type QcrRowView,
  type QcrView,
  type QuoteView,
  type TicketDetail,
} from '@bimaplacement/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Modal, MoneyInput, StatusPill } from '@/design-system/components';
import { DevSimBlock, DevSimBtn, useDevAction } from '@/dev/DevTools';
import { useLookup, useTicketCommand, useTicketSub } from '@/api/hooks';
import { api, openDocument, uploadDocument } from '@/lib/api-client';
import { fmtInr, fmtWhen } from '@/lib/format';
import { TabHeader } from './TabHeader';
import { RevisionCard } from './RevisionCard';
import type { TabProps } from '../TicketWorkspace';

const THRESHOLD = 3; // Threshold Target master: 3 usable quotes from 3 distinct insurers (BR-061)
const SOURCE: Record<QcrSource, string> = {
  [QcrSource.COPYCAT]: 'Copycat',
  [QcrSource.MANUAL]: 'Manual',
  [QcrSource.SINGLE_QUOTE]: 'Single quote',
};

/**
 * Quote Comparison Report (UI-SPEC 3.3.8, PLAN 3.4): threshold card + early release / upload, late quotes,
 * versions, Copycat states, the QCR document, editable quote rows + "Quote rows checked", release to the RM /
 * BimaSetu (FR-101/241), closure controls. Released QCRs are frozen.
 */
export function QcrTab({ ticket: t }: TabProps) {
  const { data: qcrs = [] } = useTicketSub<QcrView[]>(t.id, 'qcrs');
  const { data: quotes = [] } = useTicketSub<QuoteView[]>(t.id, 'quotes');
  const live = qcrs.filter((q) => q.rfqVersion === t.activeRfqVersion && q.status !== QcrStatus.SUPERSEDED);
  const draft = live.find((q) => q.status === QcrStatus.DRAFT);
  const released = live.find((q) => q.status === QcrStatus.RELEASED);
  const current = draft ?? released;
  const activeQuotes = quotes.filter((q) => q.rfqVersion === t.activeRfqVersion);
  const usable = activeQuotes.filter((q) => q.decision === QuoteDecision.USABLE);
  const usableInsurers = [...new Map(usable.map((q) => [q.insurerId, q.insurer.name])).values()];
  const closed = t.stage === Stage.CLOSED;
  const toBimaSetu = t.channel === Channel.BIMASETU;

  const meta =
    released && !draft
      ? `V${released.version} released${toBimaSetu ? '' : ' to RM'} · round ${released.round}`
      : draft
        ? `V${draft.version} draft · ${SOURCE[draft.source]}${draft.copycatStatus === CopycatStatus.FAILED ? ' · generation failed' : draft.source === QcrSource.COPYCAT && draft.copycatStatus !== CopycatStatus.READY ? ' · generating' : ' · awaiting release'}`
        : `${usableInsurers.length} of ${THRESHOLD} usable quotes`;

  return (
    <div className="space-y-3">
      <TabHeader title="Quote Comparison Report" meta={meta} />
      {!closed && <RevisionCard ticket={t} />}
      {!draft && !released && !closed && <ThresholdCard ticket={t} insurers={usableInsurers} />}
      {released && !draft && !closed && <LateQuotes ticket={t} released={released} quotes={activeQuotes} />}
      {!!qcrs.length && (
        <div className="flex flex-wrap gap-2">
          {qcrs.map((q) => (
            <StatusPill
              key={q.id}
              ind={
                q.status === QcrStatus.RELEASED
                  ? 'success'
                  : q.status === QcrStatus.DRAFT
                    ? 'info'
                    : 'neutral'
              }
              leading={q.status === QcrStatus.RELEASED ? <Lock size={11} /> : undefined}
            >
              QCR V{q.version} · {q.status}
              {q.status === QcrStatus.SUPERSEDED ? ` · RFQ V${q.rfqVersion}` : ''}
            </StatusPill>
          ))}
          {current && (
            <StatusPill ind="neutral" variant="outline">
              {SOURCE[current.source]}
            </StatusPill>
          )}
        </div>
      )}
      {draft?.source === QcrSource.COPYCAT &&
        (draft.copycatStatus === CopycatStatus.QUEUED ||
          draft.copycatStatus === CopycatStatus.GENERATING) && (
          <CopycatGenerating draft={draft} quotes={activeQuotes} />
        )}
      {draft?.copycatStatus === CopycatStatus.FAILED && <CopycatFailed ticketId={t.id} draft={draft} />}
      {current && (current.documentId ? <QcrDocument ticket={t} qcr={current} /> : null)}
      {current && <RowsCard ticket={t} qcr={current} editable={!!draft && !closed} />}
      {draft && !closed && <ReleaseCard ticket={t} draft={draft} />}
      {released && !draft && toBimaSetu && t.stage === Stage.QCR_RELEASED && (
        <AwaitingClient ticket={t} released={released} />
      )}
      {!closed && <ClosureControls ticket={t} released={released} />}
    </div>
  );
}

function ThresholdCard({ ticket: t, insurers }: { ticket: TicketDetail; insurers: string[] }) {
  const [modal, setModal] = useState<'early' | 'upload' | null>(null);
  const n = insurers.length;
  return (
    <div className="rounded-xl border border-line-subtle bg-white p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold">Quote Comparison Report</div>
          <p className="mt-1 text-meta text-ink-2">
            Once {THRESHOLD} usable quotes from {THRESHOLD} distinct insurers are on the current RFQ version,
            their quote PDFs go to Copycat, which builds the draft QCR. Nothing reaches the client until you
            release it.
          </p>
        </div>
        <div className="text-right">
          <div className="flex justify-end gap-1">
            {Array.from({ length: THRESHOLD }, (_, i) => (
              <span
                key={i}
                className={clsx('h-2.5 w-2.5 rounded-full', i < n ? 'bg-sem-success' : 'bg-line-soft')}
              />
            ))}
          </div>
          <div className="num mt-1 text-dense font-semibold">
            {n}/{THRESHOLD}
          </div>
          <div className="text-2xs text-ink-2">usable · distinct insurers</div>
        </div>
      </div>
      <div className="mt-3 space-y-1.5">
        {insurers.map((name) => (
          <div
            key={name}
            className="flex items-center gap-1.5 rounded-lg border border-t-green-line bg-t-green-soft px-2.5 py-1.5 text-dense text-t-green"
          >
            <CheckCircle2 size={13} /> {name}
          </div>
        ))}
        {!n && <div className="text-dense text-ink-2">No quotes have been marked usable yet.</div>}
      </div>
      {n > 0 && n < THRESHOLD && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-line-soft pt-3">
          <div>
            <div className="text-dense font-semibold text-t-orange">
              Create the QCR with {n} quote{n === 1 ? '' : 's'}
            </div>
            <div className="text-meta text-ink-2">
              The report will show {n} column{n === 1 ? '' : 's'} instead of {THRESHOLD}. A reason is required
              and stays on the record.{n === 1 ? ' With one quote, its PDF is the QCR (no Copycat).' : ''}
            </div>
          </div>
          <span className="flex gap-2">
            <Button icon={<AlertTriangle size={14} />} onClick={() => setModal('early')}>
              Create QCR with {n} quote{n === 1 ? '' : 's'}
            </Button>
            <Button icon={<Upload size={14} />} onClick={() => setModal('upload')}>
              Upload QCR
            </Button>
          </span>
        </div>
      )}
      {modal === 'early' && <EarlyReleaseModal ticketId={t.id} n={n} onClose={() => setModal(null)} />}
      {modal === 'upload' && (
        <UploadQcrModal
          ticketId={t.id}
          needsReason={n < THRESHOLD}
          title="Upload QCR"
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

function EarlyReleaseModal({ ticketId, n, onClose }: { ticketId: string; n: number; onClose: () => void }) {
  const reasons = useLookup('early_release_reason');
  const [reason, setReason] = useState('');
  const cmd = useTicketCommand<{ reason: string }>(ticketId, 'POST', '/qcrs/early-release');
  return (
    <Modal
      title={`Create the QCR with ${n} quote${n === 1 ? '' : 's'}`}
      subtitle="Below the usual threshold of 3. The reason is printed on the QCR and kept on the audit trail (FR-107)."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!reason || cmd.isPending}
            onClick={() => cmd.mutate({ reason }, { onSuccess: onClose })}
          >
            Create QCR
          </Button>
        </>
      }
    >
      <select
        className="w-full rounded-lg border border-line px-2.5 py-2 text-dense"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      >
        <option value="">Pick a reason</option>
        {reasons.map((r) => (
          <option key={r}>{r}</option>
        ))}
      </select>
      {cmd.error && <p className="mt-2 text-dense text-t-red">{cmd.error.message}</p>}
    </Modal>
  );
}

function UploadQcrModal({
  ticketId,
  needsReason,
  title,
  onClose,
}: {
  ticketId: string;
  needsReason: boolean;
  title: string;
  onClose: () => void;
}) {
  const reasons = useLookup('early_release_reason');
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const cmd = useTicketCommand<{ documentId: string; earlyReleaseReason?: string }>(
    ticketId,
    'POST',
    '/qcrs/upload',
  );
  const submit = async () => {
    if (!file) return;
    setError(null);
    try {
      const doc = await uploadDocument(file, 'qcr', ticketId);
      cmd.mutate(
        { documentId: doc.id, earlyReleaseReason: reason || undefined },
        { onSuccess: onClose, onError: (e) => setError(e.message) },
      );
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <Modal
      title={title}
      subtitle="Bypass Copycat: the uploaded file is the QCR. It lands at Pending Placement Release; nothing is sent until you release it."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!file || (needsReason && !reason) || cmd.isPending}
            onClick={submit}
          >
            Upload QCR
          </Button>
        </>
      }
    >
      <input
        ref={input}
        type="file"
        className="hidden"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />
      <button
        className="w-full rounded-xl border border-dashed border-placement bg-placement-bg px-4 py-6 text-dense text-placement"
        onClick={() => input.current?.click()}
      >
        <Upload size={16} className="mx-auto mb-1" />{' '}
        {file ? file.name : 'Click to choose the QCR file (any type, no size limit)'}
      </button>
      {needsReason && (
        <select
          className="mt-3 w-full rounded-lg border border-line px-2.5 py-2 text-dense"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        >
          <option value="">Reason for releasing below the threshold</option>
          {reasons.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      )}
      {error && <p className="mt-2 text-dense text-t-red">{error}</p>}
    </Modal>
  );
}

function LateQuotes({
  ticket: t,
  released,
  quotes,
}: {
  ticket: TicketDetail;
  released: QcrView;
  quotes: QuoteView[];
}) {
  const next = useTicketCommand(t.id, 'POST', '/qcrs/next-version');
  const nav = useNavigate();
  const [uploading, setUploading] = useState(false);
  const pending = quotes.filter((q) => q.decision === null);
  const missing = quotes.filter(
    (q) => q.decision === QuoteDecision.USABLE && !released.quoteIds.includes(q.id),
  );
  if (!pending.length && !missing.length) return null;
  return (
    <div className="rounded-xl border border-t-orange-line bg-t-orange-soft p-3">
      <div className="text-dense font-semibold text-t-orange">
        {pending.length
          ? `${pending.length} late quote${pending.length === 1 ? '' : 's'} received after QCR V${released.version}`
          : `${missing.length} usable quote${missing.length === 1 ? '' : 's'} not in QCR V${released.version}`}
      </div>
      <p className="mt-1 text-meta text-ink-2">
        Decide on the late quote, then send the next version as the next round (FR-105).
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        {!!pending.length && (
          <Button size="sm" variant="primary" onClick={() => nav(`/tickets/${t.ticketNo}/quotes`)}>
            Review quote
          </Button>
        )}
        <Button size="sm" disabled={!missing.length || next.isPending} onClick={() => next.mutate(undefined)}>
          Create QCR V{released.version + 1}
        </Button>
        <Button size="sm" icon={<Upload size={12} />} onClick={() => setUploading(true)}>
          Upload V{released.version + 1}
        </Button>
      </div>
      {next.error && <p className="mt-2 text-dense text-t-red">{next.error.message}</p>}
      {uploading && (
        <UploadQcrModal
          ticketId={t.id}
          needsReason={false}
          title={`Upload QCR V${released.version + 1}`}
          onClose={() => setUploading(false)}
        />
      )}
    </div>
  );
}

function CopycatGenerating({ draft, quotes }: { draft: QcrView; quotes: QuoteView[] }) {
  const run = useDevAction(`/dev/copycat/${draft.copycatRequestId}/run`);
  const docs = quotes.filter((q) => draft.quoteIds.includes(q.id));
  return (
    <div className="rounded-xl border border-brand-line bg-brand-50 p-3">
      <div className="flex items-center justify-between">
        <span className="text-dense font-semibold">QCR V{draft.version}</span>
        <StatusPill ind="info">Generating with Copycat</StatusPill>
      </div>
      <p className="mt-1 text-meta text-ink-2">
        Copycat is building the QCR from {docs.length} quote PDF{docs.length === 1 ? '' : 's'}. Request{' '}
        {draft.copycatRequestId}.
      </p>
      <ul className="mt-2 space-y-1 text-meta text-ink">
        {docs.map((q) => (
          <li key={q.id}>
            {q.insurer.name}
            {q.branchName ? ` · ${q.branchName}` : ''} - v{q.version} · {q.fileName}
          </li>
        ))}
      </ul>
      <DevSimBlock title="Simulate Copycat">
        <DevSimBtn disabled={run.isPending} onClick={() => run.mutate({})}>
          Run Copycat now
        </DevSimBtn>
      </DevSimBlock>
    </div>
  );
}

function CopycatFailed({ ticketId, draft }: { ticketId: string; draft: QcrView }) {
  const retry = useTicketCommand(ticketId, 'POST', `/qcrs/${draft.id}/regenerate`);
  return (
    <div className="rounded-xl border border-t-red-line bg-white p-3">
      <div className="flex items-center justify-between">
        <span className="text-dense font-semibold">QCR V{draft.version}</span>
        <StatusPill ind="error">Generation failed</StatusPill>
      </div>
      <div className="mt-2 rounded-lg bg-t-red-soft p-2 text-meta text-t-red">
        {draft.copycatError ?? 'Copycat could not generate the QCR.'}
      </div>
      <Button size="sm" className="mt-2" disabled={retry.isPending} onClick={() => retry.mutate(undefined)}>
        Retry with Copycat
      </Button>
    </div>
  );
}

function QcrDocument({ ticket: t, qcr }: { ticket: TicketDetail; qcr: QcrView }) {
  const released = qcr.status === QcrStatus.RELEASED;
  return (
    <div className="rounded-xl border border-line-subtle bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold">Quote Comparison Report - V{qcr.version}</span>
        <StatusPill ind={released ? 'success' : 'info'}>
          {released ? 'Released and locked' : 'Draft'}
        </StatusPill>
        <StatusPill ind="neutral" variant="outline">
          {SOURCE[qcr.source]}
        </StatusPill>
      </div>
      <div className="mt-1 text-meta text-ink-2">
        {t.businessName} · RFQ V{qcr.rfqVersion} · {qcr.quoteIds.length} quote
        {qcr.quoteIds.length === 1 ? '' : 's'}
        {!released ? ` · created ${fmtWhen(qcr.createdAt)}` : ''}
        {released &&
          qcr.releasedAt &&
          ` · released ${fmtWhen(qcr.releasedAt)}${qcr.releasedBy ? ` by ${qcr.releasedBy}` : ''}${qcr.sentTo ? ` to ${qcr.sentTo}` : ''}`}
      </div>
      {qcr.earlyReleaseReason && (
        <div className="mt-2 rounded-lg border border-t-orange-line bg-t-orange-soft p-2 text-meta text-t-orange">
          Released below the usual threshold with {qcr.earlyReleaseCount} usable quote
          {qcr.earlyReleaseCount === 1 ? '' : 's'} · {qcr.earlyReleaseReason}
        </div>
      )}
      <div className="mt-2 flex items-center justify-between rounded-lg border border-line-soft px-3 py-2">
        <span>
          <span className="block text-dense font-medium text-placement">
            {qcr.fileName ?? `QCR_${t.ticketNo}_V${qcr.version}`}
          </span>
          <span className="text-meta text-ink-2">
            QCR V{qcr.version} · {SOURCE[qcr.source]}
          </span>
        </span>
        <Button size="sm" onClick={() => qcr.documentId && openDocument(qcr.documentId)}>
          {qcr.source === QcrSource.COPYCAT ? 'Open' : 'Download'}
        </Button>
      </div>
      <p className="mt-2 text-meta text-ink-3">
        Terms are shown as quoted. This report does not rank the quotes or identify a preferred market - the
        choice sits with the client, advised by the RM.
      </p>
    </div>
  );
}

type RowField = 'premium' | 'sumInsured' | 'validityDate' | 'termsNote';

/**
 * Quote rows (UI-SPEC 3.3.8 #9, FR-286): autofilled from Copycat's QCR or the quote record, every cell editable.
 * Row saves and the "Quote rows checked" tick go through one queue, in order, so a save that lands late can
 * never undo a tick the PM gave after it.
 */
function RowsCard({ ticket: t, qcr, editable }: { ticket: TicketDetail; qcr: QcrView; editable: boolean }) {
  const qc = useQueryClient();
  const rows = useQuery({
    queryKey: ['ticket', t.id, 'qcr-rows', qcr.id],
    queryFn: () => api<QcrRowView[]>(`/tickets/${t.id}/qcrs/${qcr.id}/rows`),
  });
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const [pending, setPending] = useState(0);
  const [error, setError] = useState<string | null>(null);
  // cells whose last save failed: the tick is refused until each one saves
  const failed = useRef(new Set<string>());
  const enqueue = (call: () => Promise<unknown>) => {
    setPending((n) => n + 1);
    setError(null);
    const next = queue.current
      .then(call)
      .catch((e: Error) => setError(e.message))
      .finally(() => {
        setPending((n) => n - 1);
        void qc.invalidateQueries({ queryKey: ['ticket', t.id] });
        void qc.invalidateQueries({ queryKey: ['ticket-no', t.ticketNo] });
      });
    queue.current = next;
    return next;
  };
  const save = (quoteId: string, field: RowField, value: string | number | null) =>
    enqueue(async () => {
      const cell = `${quoteId}:${field}`;
      try {
        await api(`/tickets/${t.id}/qcrs/${qcr.id}/rows/${quoteId}`, {
          method: 'PATCH',
          json: { field, value },
        });
        failed.current.delete(cell);
      } catch (e) {
        failed.current.add(cell);
        throw e;
      }
    });
  const autofilled = (rows.data ?? []).some((r) => Object.keys(r.autofill ?? {}).length);
  return (
    <div className="overflow-hidden rounded-xl border border-line-subtle bg-white">
      <div className="flex items-center justify-between border-b border-line-soft px-3 py-2.5">
        <span className="text-sm font-semibold">
          Quote rows · QCR V{qcr.version} · round {qcr.round}
        </span>
        <span className="text-meta text-ink-2">
          {pending > 0
            ? 'Saving…'
            : !editable
              ? 'Sent with the QCR and locked.'
              : autofilled
                ? 'Filled from the QCR. Check each value and edit where needed.'
                : 'Fill in each row from the QCR.'}
        </span>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_150px_140px_150px_minmax(0,1fr)] gap-3 bg-card-sunk px-3 py-2 text-xs font-semibold text-ink-2">
        <span>Insurer</span>
        <span>Premium</span>
        <span>Sum insured</span>
        <span>Validity</span>
        <span>Terms note</span>
      </div>
      {(rows.data ?? []).map((r) => (
        <RowEditor key={r.id} row={r} editable={editable} save={(f, v) => save(r.quoteId, f, v)} />
      ))}
      {!rows.data?.length && <div className="px-3 py-3 text-dense text-ink-2">No quotes in this draft.</div>}
      {error && <div className="border-t border-line-soft px-3 py-2 text-dense text-t-red">{error}</div>}
      <label
        className={clsx(
          'flex items-start gap-2 border-t border-line-soft px-3 py-3',
          !editable && 'opacity-70',
        )}
      >
        <input
          type="checkbox"
          className="mt-0.5 h-4 w-4 accent-brand"
          checked={qcr.rowsChecked}
          disabled={!editable}
          onChange={(e) => {
            const checked = e.target.checked;
            void enqueue(async () => {
              if (checked && failed.current.size)
                throw new Error('A row edit did not save. Fix it, then tick "Quote rows checked" again.');
              await api(`/tickets/${t.id}/qcrs/${qcr.id}/rows-checked`, { method: 'PUT', json: { checked } });
            });
          }}
        />
        <span>
          <span className="block text-dense font-semibold">Quote rows checked</span>
          <span className="text-meta text-ink-2">
            These rows go to {t.channel === Channel.BIMASETU ? 'BimaSetu' : 'the RM'} with the QCR file.
            Editing a row clears this tick.
          </span>
        </span>
      </label>
    </div>
  );
}

const SOURCE_LABEL = { copycat: 'From QCR', quote: 'From Quote' } as const;

/** One quote row: each cell commits on blur and says where its value came from. */
function RowEditor({
  row,
  editable,
  save,
}: {
  row: QcrRowView;
  editable: boolean;
  save: (field: RowField, value: string | number | null) => void;
}) {
  const origin = (field: RowField) => {
    const auto = row.autofill?.[field];
    if (row.edited?.includes(field))
      return (
        <span className="flex items-center gap-1.5 text-[11px] text-t-orange">
          Edited
          {auto && editable && (
            <button
              className="text-brand underline-offset-2 hover:underline"
              onClick={() => save(field, auto.value)}
            >
              Use {auto.source === 'copycat' ? 'QCR' : 'Quote'} Value
            </button>
          )}
        </span>
      );
    return auto ? <span className="block text-[11px] text-ink-3">{SOURCE_LABEL[auto.source]}</span> : null;
  };
  const text = (field: 'sumInsured' | 'termsNote', placeholder: string) => (
    <div>
      <input
        key={`${field}-${row[field] ?? ''}`}
        disabled={!editable}
        defaultValue={row[field] ?? ''}
        placeholder={placeholder}
        className="w-full rounded-lg border border-line px-2 py-1.5 text-dense disabled:bg-card-sunk"
        onBlur={(e) =>
          e.target.value.trim() !== (row[field] ?? '') && save(field, e.target.value.trim() || null)
        }
      />
      {origin(field)}
    </div>
  );
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_150px_140px_150px_minmax(0,1fr)] items-start gap-3 border-t border-line-soft px-3 py-2">
      <span className="pt-1.5 text-dense font-semibold">{row.insurerName}</span>
      <div>
        {editable ? (
          <MoneyInput
            label={`${row.insurerName} premium`}
            value={row.premium}
            onCommit={(v) => save('premium', v)}
          />
        ) : (
          <span className="num block pt-1.5 text-dense">{row.premium ? fmtInr(row.premium) : '-'}</span>
        )}
        {origin('premium')}
      </div>
      {text('sumInsured', 'Sum insured')}
      <div>
        <input
          key={`validity-${row.validityDate ?? ''}`}
          type="date"
          aria-label={`${row.insurerName} validity`}
          disabled={!editable}
          defaultValue={row.validityDate ?? ''}
          className="num w-full rounded-lg border border-line px-2 py-1.5 text-dense disabled:bg-card-sunk"
          onBlur={(e) =>
            e.target.value !== (row.validityDate ?? '') && save('validityDate', e.target.value || null)
          }
        />
        {origin('validityDate')}
      </div>
      {text('termsNote', 'Key terms')}
    </div>
  );
}

/**
 * Floated ticket after the QCR went to BimaSetu (FR-288): the client decides in BimaSetu; the ticket closes when
 * the confirmation or "line lost" arrives. The dev simulators stand in for BimaSetu.
 */
function AwaitingClient({ ticket: t, released }: { ticket: TicketDetail; released: QcrView }) {
  const rows = useQuery({
    queryKey: ['ticket', t.id, 'qcr-rows', released.id],
    queryFn: () => api<QcrRowView[]>(`/tickets/${t.id}/qcrs/${released.id}/rows`),
  });
  const confirm = useDevAction(`/dev/tickets/${t.id}/bimasetu/client_confirmation`);
  const lost = useDevAction(`/dev/tickets/${t.id}/bimasetu/line_lost`);
  return (
    <>
      <div className="rounded-xl border border-line-subtle bg-white p-4">
        <div className="text-sm font-semibold">Waiting for the client&apos;s decision in BimaSetu</div>
        <div className="mt-0.5 text-dense text-ink-2">
          QCR V{released.version} is with the RM in BimaSetu. The ticket closes when BimaSetu sends the
          client&apos;s confirmation or reports the line lost; a revision request opens the next round.
        </div>
      </div>
      <DevSimBlock title="Simulate BimaSetu client decision">
        {(rows.data ?? []).map((r) => (
          <DevSimBtn
            key={r.id}
            disabled={confirm.isPending}
            onClick={() => confirm.mutate({ qcrRound: released.round, quoteRowId: r.id })}
          >
            Client confirms {r.insurerName}
          </DevSimBtn>
        ))}
        <DevSimBtn
          disabled={lost.isPending}
          onClick={() => lost.mutate({ reason: 'Client placed elsewhere' })}
        >
          Line lost
        </DevSimBtn>
      </DevSimBlock>
    </>
  );
}

function ReleaseCard({ ticket: t, draft }: { ticket: TicketDetail; draft: QcrView }) {
  const [sending, setSending] = useState(false);
  const toBimaSetu = t.channel === Channel.BIMASETU;
  const ready = draft.source !== QcrSource.COPYCAT || draft.copycatStatus === CopycatStatus.READY;
  const can = ready && !!draft.documentId && draft.rowsChecked;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-line bg-brand-50 p-3">
      <div>
        <div className="text-sm font-semibold">
          {toBimaSetu
            ? `Send QCR V${draft.version} to BimaSetu · round ${draft.round}`
            : `Release QCR V${draft.version} to the RM`}
        </div>
        <div className="text-meta text-ink-2">
          {!ready
            ? 'Copycat has not returned the QCR yet.'
            : !draft.rowsChecked
              ? 'Tick "Quote rows checked" first.'
              : `The version locks once sent; ${toBimaSetu ? 'BimaSetu receives the file and the rows only - never insurer documents (FR-290).' : `${t.rm.name} receives it by mail.`}`}
        </div>
      </div>
      <Button
        variant="primary"
        size="lg"
        icon={<Send size={14} />}
        disabled={!can}
        title={!draft.rowsChecked ? 'Tick Quote rows checked first' : undefined}
        onClick={() => setSending(true)}
      >
        {toBimaSetu ? 'Send to BimaSetu' : 'Send to RM'}
      </Button>
      {sending && <SendQcrModal ticket={t} draft={draft} onClose={() => setSending(false)} />}
    </div>
  );
}

function SendQcrModal({
  ticket: t,
  draft,
  onClose,
}: {
  ticket: TicketDetail;
  draft: QcrView;
  onClose: () => void;
}) {
  const [note, setNote] = useState('');
  const release = useTicketCommand<{ coverNote?: string }>(t.id, 'POST', `/qcrs/${draft.id}/release`);
  const toBimaSetu = t.channel === Channel.BIMASETU;
  return (
    <Modal
      title={
        toBimaSetu ? `Send QCR V${draft.version} to BimaSetu` : `Send QCR V${draft.version} to ${t.rm.name}`
      }
      subtitle="Released QCRs are frozen; a later change becomes the next version."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon={<Send size={14} />}
            disabled={release.isPending}
            onClick={() => release.mutate({ coverNote: note.trim() || undefined }, { onSuccess: onClose })}
          >
            {toBimaSetu ? 'Send to BimaSetu' : 'Send to RM'}
          </Button>
        </>
      }
    >
      {!toBimaSetu && (
        <textarea
          className="w-full rounded-lg border border-line px-2.5 py-2 text-dense"
          rows={3}
          placeholder="Cover note to the RM (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      )}
      {toBimaSetu && (
        <p className="text-dense text-ink-2">BimaSetu receives the QCR file and the checked rows.</p>
      )}
      {release.error && <p className="mt-2 text-dense text-t-red">{release.error.message}</p>}
    </Modal>
  );
}

/** Closure (UI-SPEC 3.3.8 #12): manual tickets log the client decision (FR-269); floated tickets can close as No appetite. */
function ClosureControls({ ticket: t, released }: { ticket: TicketDetail; released?: QcrView }) {
  const [menu, setMenu] = useState(false);
  const [modal, setModal] = useState<'quote_selected' | 'no_appetite' | 'lost' | null>(null);
  const manual = t.channel === Channel.MANUAL;
  return (
    <div className="relative flex justify-end">
      {manual ? (
        <Button variant="primary" iconRight={<ChevronDown size={14} />} onClick={() => setMenu((m) => !m)}>
          Log client decision
        </Button>
      ) : (
        <Button onClick={() => setModal('no_appetite')}>Close: No appetite</Button>
      )}
      {menu && (
        <div className="absolute right-0 top-11 z-30 w-[340px] overflow-hidden rounded-xl border border-line-menu bg-white shadow-menu">
          {(
            [
              [
                'quote_selected',
                'Quote selected',
                released ? `Pick a quote row from QCR V${released.version}` : 'Needs a released QCR',
              ],
              ['no_appetite', 'No appetite', 'No insurer will write this risk'],
              ['lost', 'Lost', 'Client placed elsewhere or withdrew'],
            ] as const
          ).map(([k, label, sub]) => (
            <button
              key={k}
              disabled={k === 'quote_selected' && !released}
              onClick={() => {
                setMenu(false);
                setModal(k);
              }}
              className="block w-full border-b border-line-soft px-3 py-2.5 text-left last:border-0 hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className="block text-dense font-semibold">{label}</span>
              <span className="text-meta text-ink-2">{sub}</span>
            </button>
          ))}
        </div>
      )}
      {modal && <DecisionModal ticket={t} kind={modal} released={released} onClose={() => setModal(null)} />}
    </div>
  );
}

function DecisionModal({
  ticket: t,
  kind,
  released,
  onClose,
}: {
  ticket: TicketDetail;
  kind: 'quote_selected' | 'no_appetite' | 'lost';
  released?: QcrView;
  onClose: () => void;
}) {
  const rows = useQuery({
    enabled: kind === 'quote_selected' && !!released,
    queryKey: ['ticket', t.id, 'qcr-rows', released?.id],
    queryFn: () => api<QcrRowView[]>(`/tickets/${t.id}/qcrs/${released!.id}/rows`),
  });
  const [rowId, setRowId] = useState('');
  const [reason, setReason] = useState('');
  const manual = t.channel === Channel.MANUAL;
  const cmd = useTicketCommand<Record<string, string>>(
    t.id,
    'POST',
    manual ? '/client-decision' : '/close/no-appetite',
  );
  const body: Record<string, string> = manual
    ? kind === 'quote_selected'
      ? { kind, qcrRowId: rowId }
      : { kind, reason }
    : { reason };
  const ok = kind === 'quote_selected' ? !!rowId : !!reason.trim();
  return (
    <Modal
      title={
        {
          quote_selected: 'Log client decision: Quote selected',
          no_appetite: 'Close: No appetite',
          lost: 'Log client decision: Lost',
        }[kind]
      }
      subtitle="Closed tickets are read-only and never reopen (FR-135)."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!ok || cmd.isPending}
            onClick={() => cmd.mutate(body, { onSuccess: onClose })}
          >
            Close ticket
          </Button>
        </>
      }
    >
      {kind === 'quote_selected' ? (
        <div className="space-y-2">
          {(rows.data ?? []).map((r) => (
            <label
              key={r.id}
              className={clsx(
                'flex items-center justify-between rounded-lg border px-3 py-2 text-dense',
                rowId === r.id ? 'border-brand bg-brand-50' : 'border-line-subtle',
              )}
            >
              <span className="flex items-center gap-2">
                <input
                  type="radio"
                  name="row"
                  className="accent-brand"
                  checked={rowId === r.id}
                  onChange={() => setRowId(r.id)}
                />{' '}
                {r.insurerName}
              </span>
              <span className="num font-semibold">{r.premium ? fmtInr(r.premium) : '-'}</span>
            </label>
          ))}
        </div>
      ) : (
        <textarea
          className="w-full rounded-lg border border-line px-2.5 py-2 text-dense"
          rows={3}
          placeholder="Reason (required)"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      )}
      {cmd.error && <p className="mt-2 text-dense text-t-red">{cmd.error.message}</p>}
    </Modal>
  );
}
