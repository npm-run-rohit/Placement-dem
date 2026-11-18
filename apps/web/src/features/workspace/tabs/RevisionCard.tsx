import { CheckCircle2, MessageSquareWarning } from 'lucide-react';
import { useState } from 'react';
import {
  ThreadStatus,
  Stage,
  type PanelEntityView,
  type RevisionView,
  type ThreadView,
  type TicketDetail,
  type RfqVersionView,
} from '@bimaplacement/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Modal, StatusPill } from '@/design-system/components';
import { DevSimBlock, DevSimBtn, useDevAction } from '@/dev/DevTools';
import { useTicketCommand, useTicketSub } from '@/api/hooks';
import { api, uploadDocument } from '@/lib/api-client';
import { fmtWhen } from '@/lib/format';

const ASK: Record<string, string> = {
  rerate: 'Re-rate',
  insurer: 'A different insurer',
  cover: 'Changed sum insured or cover',
  terms: 'Revised terms',
};
const VIA: Record<NonNullable<RevisionView['handledVia']>, string> = {
  restart_threads: 'threads restarted',
  add_insurer: 'insurer added',
  new_rfq_version: 'RFQ V2 created',
};
const RESTARTABLE = [
  ThreadStatus.RFQ_SENT,
  ThreadStatus.ACKNOWLEDGED,
  ThreadStatus.INSURER_CLARIFICATION,
  ThreadStatus.QUOTE_RECEIVED,
  ThreadStatus.QUOTE_USABLE,
  ThreadStatus.QUOTE_CLARIFICATION,
  ThreadStatus.QUOTE_EXCLUDED,
  ThreadStatus.DECLINED,
  ThreadStatus.NO_RESPONSE,
];

/**
 * Revision round (M11, FR-250 / FR-287): what was objected to and the three ways forward. No insurer is
 * contacted until the PM picks one; any of them closes the round's PM task.
 */
export function RevisionCard({ ticket: t }: { ticket: TicketDetail }) {
  const { data: revisions = [] } = useQuery({
    queryKey: ['ticket', t.id, 'revisions'],
    queryFn: () => api<RevisionView[]>(`/tickets/${t.id}/revisions`),
  });
  const [modal, setModal] = useState<'restart' | 'add' | 'rfq' | null>(null);
  const sim = useDevAction(`/dev/tickets/${t.id}/revision`);
  const open = revisions.find((r) => !r.handledAt);
  const last = revisions[0];

  if (!open) {
    return (
      <>
        {last?.handledVia && (
          <div className="flex items-center gap-1.5 text-dense text-ink-2">
            <CheckCircle2 size={14} className="text-t-green" /> Revision round {last.round} handled:{' '}
            {VIA[last.handledVia]} · {fmtWhen(last.handledAt)}
          </div>
        )}
        {t.stage === Stage.QCR_RELEASED && (
          <DevSimBlock title="Simulate BimaSetu revision request">
            <DevSimBtn
              disabled={sim.isPending}
              onClick={() =>
                sim.mutate({ by: 'client', reason: 'Premium is above the budget', asks: ['rerate'] })
              }
            >
              Client asks for a re-rate
            </DevSimBtn>
            <DevSimBtn
              disabled={sim.isPending}
              onClick={() => sim.mutate({ by: 'us', reason: 'Need one more market', asks: ['insurer'] })}
            >
              We ask for another insurer
            </DevSimBtn>
            <DevSimBtn
              disabled={sim.isPending}
              onClick={() => sim.mutate({ by: 'client', reason: 'Sum insured changed', asks: ['cover'] })}
            >
              Cover changed
            </DevSimBtn>
          </DevSimBlock>
        )}
      </>
    );
  }

  return (
    <div className="rounded-xl border border-t-orange-line bg-t-orange-soft p-4">
      <div className="flex items-start gap-2.5">
        <MessageSquareWarning size={18} className="mt-0.5 shrink-0 text-t-orange" />
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-ink">Revision requested · round {open.round}</div>
          <div className="mt-0.5 text-dense text-ink-2">
            {open.by === 'client' ? 'The client' : 'We'} objected to QCR V{open.qcrVersion}: {open.reason} ·{' '}
            {fmtWhen(open.receivedAt)}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {open.asks.map((a) => (
              <StatusPill key={a} ind="caution">
                {ASK[a] ?? a}
              </StatusPill>
            ))}
          </div>
          <div className="mt-2 text-meta text-ink-2">No insurer has been contacted. Pick how to proceed.</div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="primary" onClick={() => setModal('restart')}>
              Restart threads
            </Button>
            <Button size="sm" onClick={() => setModal('add')}>
              Add an insurer
            </Button>
            <Button size="sm" onClick={() => setModal('rfq')}>
              New RFQ version
            </Button>
          </div>
        </div>
      </div>
      {modal === 'restart' && <RestartThreadsModal ticket={t} onClose={() => setModal(null)} />}
      {modal === 'add' && <AddInsurerModal ticket={t} onClose={() => setModal(null)} />}
      {modal === 'rfq' && <NewRfqVersionModal ticket={t} onClose={() => setModal(null)} />}
    </div>
  );
}

const field = 'mt-1 w-full rounded-lg border border-line px-2.5 py-2 text-dense font-normal text-ink';

/** PlRestartThreadsModal: fresh clock + RFQ re-sent on the picked threads (FR-067), reason required. */
function RestartThreadsModal({ ticket: t, onClose }: { ticket: TicketDetail; onClose: () => void }) {
  const { data: threads = [] } = useTicketSub<ThreadView[]>(t.id, 'threads');
  const restartable = threads.filter(
    (th) => th.rfqVersion === t.activeRfqVersion && RESTARTABLE.includes(th.status),
  );
  const [picked, setPicked] = useState<string[]>([]);
  const [reason, setReason] = useState('');
  const cmd = useTicketCommand<{ threadIds: string[]; reason: string }>(t.id, 'POST', '/threads/restart');
  return (
    <Modal
      title="Restart threads"
      subtitle="Each picked thread gets a fresh clock and the RFQ is re-sent to its contacts."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!picked.length || !reason.trim() || cmd.isPending}
            onClick={() => cmd.mutate({ threadIds: picked, reason: reason.trim() }, { onSuccess: onClose })}
          >
            Restart {picked.length || ''} thread{picked.length === 1 ? '' : 's'}
          </Button>
        </>
      }
    >
      <div className="space-y-1.5">
        {restartable.map((th) => (
          <label
            key={th.id}
            className="flex items-center gap-2.5 rounded-lg border border-line-soft px-3 py-2 text-dense"
          >
            <input
              type="checkbox"
              checked={picked.includes(th.id)}
              onChange={(e) =>
                setPicked(e.target.checked ? [...picked, th.id] : picked.filter((x) => x !== th.id))
              }
            />
            <span className="font-semibold">{th.threadRef}</span> {th.insurer.name}
            {th.branch.name ? ` · ${th.branch.name}` : ''}
            <span className="ml-auto text-meta text-ink-3">{th.status.replace(/_/g, ' ')}</span>
          </label>
        ))}
        {!restartable.length && (
          <div className="text-dense text-ink-2">No thread on this RFQ version can be restarted.</div>
        )}
      </div>
      <label className="mt-3 block text-xs font-semibold text-ink-2">
        Reason
        <input
          className={field}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="e.g. Client asked for a re-rate"
        />
      </label>
      {cmd.error && <p className="mt-2 text-dense text-t-red">{cmd.error.message}</p>}
    </Modal>
  );
}

/** PlAddInsurerModal (also the add-insurer-after-float path, PLAN 2.3): each pick opens a new thread. */
export function AddInsurerModal({ ticket: t, onClose }: { ticket: TicketDetail; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: entities = [] } = useTicketSub<PanelEntityView[]>(t.id, 'insurer-entities');
  const { data: threads = [] } = useTicketSub<ThreadView[]>(t.id, 'threads');
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const threaded = new Set(
    threads
      .filter((th) => th.rfqVersion === t.activeRfqVersion)
      .map((th) => `${th.insurerId}:${th.branch.id}`),
  );
  const key = (e: PanelEntityView) => `${e.insurerId}:${e.branchId}`;
  const candidates = entities.filter(
    (e) => !threaded.has(key(e)) && e.label.toLowerCase().includes(q.trim().toLowerCase()),
  );
  const add = useMutation({
    mutationFn: async () => {
      for (const k of picked) {
        const [insurerId, branchId] = k.split(':');
        await api(`/tickets/${t.id}/panel`, { method: 'PUT', json: { insurerId, branchId, selected: true } });
      }
    },
    onSettled: () => qc.invalidateQueries(),
    onSuccess: onClose,
  });
  return (
    <Modal
      title="Add an insurer"
      subtitle="Each insurer you add gets its own thread and the RFQ from your mailbox."
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!picked.length || add.isPending} onClick={() => add.mutate()}>
            Add {picked.length || ''}
          </Button>
        </>
      }
    >
      <input
        className={`${field} mb-3`}
        placeholder="Search insurers"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="max-h-[50vh] space-y-1.5 overflow-y-auto">
        {candidates.map((e) => (
          <label
            key={key(e)}
            className={`flex items-center gap-2.5 rounded-lg border border-line-soft px-3 py-2 text-dense ${e.lock ? 'opacity-60' : ''}`}
            title={e.lock ?? undefined}
          >
            <input
              type="checkbox"
              disabled={!!e.lock}
              checked={picked.includes(key(e))}
              onChange={(ev) =>
                setPicked(ev.target.checked ? [...picked, key(e)] : picked.filter((x) => x !== key(e)))
              }
            />
            <span className="font-semibold">{e.label}</span>
            {!e.inAppetite && (
              <StatusPill ind="neutral" variant="outline">
                Outside appetite
              </StatusPill>
            )}
            <span className="ml-auto text-meta text-ink-3">
              {e.lock ?? `${e.pocs.length} contact${e.pocs.length === 1 ? '' : 's'}`}
            </span>
          </label>
        ))}
        {!candidates.length && <div className="text-dense text-ink-2">No other insurer can be added.</div>}
      </div>
      {add.error && <p className="mt-2 text-dense text-t-red">{(add.error as Error).message}</p>}
    </Modal>
  );
}

/** PlOutcomeModal "rfq_v2": change note + a fresh source of every type the current version has (FR-251). */
function NewRfqVersionModal({ ticket: t, onClose }: { ticket: TicketDetail; onClose: () => void }) {
  const { data: versions = [] } = useTicketSub<RfqVersionView[]>(t.id, 'rfq/versions');
  const current = versions.find((v) => v.version === t.activeRfqVersion);
  const needsLink = !!current?.linkUrl;
  const needsExcel = !!current?.excelDocumentId;
  const [note, setNote] = useState('');
  const [link, setLink] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const cmd = useTicketCommand<{ changeNote: string; linkUrl?: string; excelDocumentId?: string }>(
    t.id,
    'POST',
    '/rfq/versions',
  );
  const ready = !!note.trim() && (!needsLink || /^https?:\/\//.test(link)) && (!needsExcel || !!file);
  const submit = async () => {
    const excelDocumentId = file ? (await uploadDocument(file, 'rfq_excel', t.id)).id : undefined;
    cmd.mutate(
      { changeNote: note.trim(), linkUrl: needsLink ? link : undefined, excelDocumentId },
      { onSuccess: onClose },
    );
  };
  return (
    <Modal
      title={`New RFQ version (V${t.activeRfqVersion + 1})`}
      subtitle="Quotes and QCRs on the current version are superseded; insurers get new threads after you float again."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!ready || cmd.isPending} onClick={() => void submit()}>
            Create RFQ V{t.activeRfqVersion + 1}
          </Button>
        </>
      }
    >
      <label className="block text-xs font-semibold text-ink-2">
        What changed
        <textarea
          className={field}
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="e.g. Sum insured raised to 12 Cr"
        />
      </label>
      {needsLink && (
        <label className="mt-3 block text-xs font-semibold text-ink-2">
          New RFQ link
          <input
            className={field}
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://..."
          />
        </label>
      )}
      {needsExcel && (
        <label className="mt-3 block text-xs font-semibold text-ink-2">
          New RFQ Excel
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            className={field}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
      )}
      {cmd.error && <p className="mt-2 text-dense text-t-red">{cmd.error.message}</p>}
    </Modal>
  );
}
