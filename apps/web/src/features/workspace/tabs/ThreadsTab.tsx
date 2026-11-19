import clsx from 'clsx';
import { ChevronDown, ChevronRight, Pause, PhoneCall, Users } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Channel,
  ThreadStatus,
  THREAD_STATUS_META,
  type ThreadEventView,
  type ThreadView,
  type TicketDetail,
} from '@bimaplacement/contracts';
import { Button, EmptyState, InsurerMark, Modal, StatusPill } from '@/design-system/components';
import { toneToInd } from '@/design-system/tokens';
import { DevSimBlock, DevSimBtn, useDevAction } from '@/dev/DevTools';
import { useTicketCommand, useTicketSub } from '@/api/hooks';
import { useQuery } from '@tanstack/react-query';
import { api, openDocument } from '@/lib/api-client';
import { fmtBizMins, fmtWhen } from '@/lib/format';
import type { TabProps } from '../TicketWorkspace';

const TERMINAL = [
  ThreadStatus.DECLINED,
  ThreadStatus.QUOTE_USABLE,
  ThreadStatus.QUOTE_EXCLUDED,
  ThreadStatus.NOT_APPLICABLE,
];

/**
 * Insurer Threads (UI-SPEC 3.3.6b, PLAN 2.8): one independent thread per insurer + branch. A clarification,
 * decline or held clock on one thread changes nothing on the others (FR-063/064). Live insurer clock in business time.
 */
export function ThreadsTab({ ticket: t }: TabProps) {
  const { data: threads = [], isLoading } = useTicketSub<ThreadView[]>(t.id, 'threads');
  const [open, setOpen] = useState<string | null>(null);
  const active = threads.filter((x) => x.rfqVersion === t.activeRfqVersion);
  if (isLoading) return <div className="p-4 text-dense text-ink-2">Loading…</div>;
  if (!active.length)
    return (
      <EmptyState
        icon={<Users size={20} />}
        title="RFQ has not been sent to insurers yet"
        body="Approve the insurer panel on the Insurer Panel sub-tab to start one thread per insurer + branch."
      />
    );
  const openCount = active.filter((x) => !TERMINAL.includes(x.status)).length;

  return (
    <div className="space-y-3">
      {t.followUpsStopped && (
        <div className="rounded-xl border border-t-green-line bg-t-green-soft p-3 text-dense text-t-green">
          <b>Automated follow-ups stopped</b> - the usable-quote threshold was reached. {openCount} thread
          {openCount === 1 ? '' : 's'} remain open; late quotes can still be reviewed.
        </div>
      )}
      <div className="text-dense text-ink-2">
        <b className="text-ink">Insurer threads</b> - independent per insurer + branch. A clarification,
        decline or held clock on one thread changes nothing on the others. Every POC on a thread is in To.
      </div>
      <div className="overflow-hidden rounded-xl border border-line-subtle">
        <div className="grid grid-cols-[minmax(220px,1.4fr)_180px_130px_110px_190px] gap-3 bg-card-sunk px-3 py-2 text-xs font-semibold text-ink-2">
          <span>Insurer & Activity</span>
          <span>Status</span>
          <span>Date & Time</span>
          <span>Stage Due</span>
          <span>Actions</span>
        </div>
        {active.map((th) => (
          <ThreadRow
            key={th.id}
            ticket={t}
            th={th}
            open={open === th.id}
            onToggle={() => setOpen(open === th.id ? null : th.id)}
          />
        ))}
      </div>
    </div>
  );
}

function followUpTone(n: number) {
  return n === 0 ? 'neutral' : n === 1 ? 'success' : n === 2 ? 'caution' : 'error';
}

function StageDue({ th }: { th: ThreadView }) {
  if (TERMINAL.includes(th.status) || th.remainingMins === null)
    return <span className="text-ink-3">N/A</span>;
  if (th.held)
    return <span className="num font-medium text-sem-success">{fmtBizMins(th.remainingMins)} held</span>;
  if (th.remainingMins < 0)
    return <span className="num font-medium text-sem-error">{fmtBizMins(-th.remainingMins)} over</span>;
  return <span className="num font-medium text-sem-caution">{fmtBizMins(th.remainingMins)} left</span>;
}

function ThreadRow({
  ticket: t,
  th,
  open,
  onToggle,
}: {
  ticket: TicketDetail;
  th: ThreadView;
  open: boolean;
  onToggle: () => void;
}) {
  const meta = THREAD_STATUS_META[th.status];
  return (
    <div
      className={clsx(
        'border-t border-line-soft',
        th.held ? 'bg-t-orange-soft' : !TERMINAL.includes(th.status) && 'bg-card-alt',
      )}
    >
      <div className="grid grid-cols-[minmax(220px,1.4fr)_180px_130px_110px_190px] items-center gap-3 px-3 py-3">
        <button className="flex items-center gap-2 text-left" onClick={onToggle} aria-expanded={open}>
          {open ? (
            <ChevronDown size={14} className="text-ink-2" />
          ) : (
            <ChevronRight size={14} className="text-ink-2" />
          )}
          <InsurerMark name={th.insurer.name} logoUrl={th.insurer.logoUrl} />
          {th.multiBranch && th.branch.name && (
            <StatusPill ind="neutral" variant="outline">
              {th.branch.name}
            </StatusPill>
          )}
          {TERMINAL.includes(th.status) ? (
            <StatusPill ind="neutral">N/A</StatusPill>
          ) : (
            <StatusPill ind={followUpTone(th.followUpsSent)} variant="outline">
              {th.followUpsSent} follow-up{th.followUpsSent === 1 ? '' : 's'}
            </StatusPill>
          )}
        </button>
        <span>
          <StatusPill ind={toneToInd[meta.tone]}>
            {meta.label}
            {meta.sub ? ` · ${meta.sub}` : ''}
          </StatusPill>
        </span>
        <span className="num text-meta text-ink-2">{th.lastEventAt ? fmtWhen(th.lastEventAt) : '-'}</span>
        <span className="text-dense">
          <StageDue th={th} />
        </span>
        <span>
          <ThreadAction ticket={t} th={th} />
        </span>
      </div>
      {open && <ThreadDetail ticket={t} th={th} />}
    </div>
  );
}

/** The one state-driven action per thread (UI-SPEC 3.3.6b table). */
function ThreadAction({ ticket: t, th }: { ticket: TicketDetail; th: ThreadView }) {
  const nav = useNavigate();
  const [modal, setModal] = useState<'hold' | 'reply' | null>(null);
  const followUp = useTicketCommand(t.id, 'POST', `/threads/${th.id}/follow-up`);
  const undecided = th.latestQuote && th.latestQuote.decision === null;
  const full = 'w-full justify-between';
  let action: ReactNode = null;
  if (
    (th.status === ThreadStatus.QUOTE_RECEIVED || th.status === ThreadStatus.QUOTE_CLARIFICATION) &&
    undecided
  ) {
    action = (
      <Button
        variant="primary"
        size="sm"
        className={full}
        iconRight={<ChevronRight size={13} />}
        onClick={() => nav(`/tickets/${t.ticketNo}/quotes`)}
      >
        Review Quote
      </Button>
    );
  } else if (th.status === ThreadStatus.AWAITING_RM) {
    action = th.clarification?.rmResponse ? (
      <Button
        variant="primary"
        size="sm"
        className={full}
        iconRight={<ChevronRight size={13} />}
        onClick={() => setModal('reply')}
      >
        Reply to insurer
      </Button>
    ) : (
      <Button size="sm" className={full} disabled>
        RM Response
      </Button>
    );
  } else if (th.status === ThreadStatus.INSURER_CLARIFICATION) {
    action = (
      <Button
        variant="primary"
        size="sm"
        className={full}
        iconRight={<ChevronRight size={13} />}
        onClick={() => setModal('hold')}
      >
        Request from RM
      </Button>
    );
  } else if (
    [ThreadStatus.RFQ_SENT, ThreadStatus.ACKNOWLEDGED, ThreadStatus.NO_RESPONSE].includes(th.status) &&
    th.followUpsActive &&
    th.followUpsSent < 3
  ) {
    action = (
      <Button
        size="sm"
        className={full}
        iconRight={<ChevronRight size={13} />}
        disabled={followUp.isPending}
        onClick={() => followUp.mutate(undefined)}
      >
        {th.followUpsSent >= 2 ? 'Send escalation' : 'Send follow-up'}
      </Button>
    );
  }
  return (
    <>
      {action}
      {modal === 'hold' && (
        <TextModal
          ticketId={t.id}
          path={`/threads/${th.id}/hold-for-rm`}
          field="request"
          title={`Request information from ${t.rm.name}`}
          subtitle={`${th.insurer.name}'s clock is held at its remaining time until you reply (FR-063). Other threads keep running.${t.channel === Channel.BIMASETU ? ' The RM reads this in BimaSetu, so do not name the insurer (FR-290).' : ''}`}
          cta="Send request"
          initial={th.clarification?.question ?? ''}
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'reply' && (
        <TextModal
          ticketId={t.id}
          path={`/threads/${th.id}/reply`}
          field="text"
          title={`Reply to ${th.insurer.name}`}
          subtitle="Mailed to every POC on the thread; the insurer clock resumes with exactly the time it had left (FR-064)."
          cta="Send reply and resume clock"
          initial={th.clarification?.rmResponse ?? ''}
          onClose={() => setModal(null)}
        />
      )}
    </>
  );
}

const ACTOR_DOT: Record<string, string> = {
  Insurer: 'bg-placement',
  System: 'bg-ink-3',
  BimaSetu: 'bg-ink-3',
  Copycat: 'bg-ink-3',
  RM: 'bg-t-blue',
};

function ThreadDetail({ ticket: t, th }: { ticket: TicketDetail; th: ThreadView }) {
  const timeline = useQuery({
    queryKey: ['ticket', t.id, 'thread', th.id],
    queryFn: () => api<ThreadEventView[]>(`/tickets/${t.id}/threads/${th.id}/timeline`),
  });
  const [logging, setLogging] = useState(false);
  const c = th.clarification;
  return (
    <div className="grid gap-4 border-t border-line-soft bg-white px-3 py-3 md:grid-cols-2">
      <div>
        <div className="mb-2 text-meta font-semibold text-ink">
          Thread history · {th.threadRef} · To: {th.pocs.map((p) => p.name).join(', ')}
          {th.branch.name ? ` · ${th.branch.name}` : ''}
        </div>
        <ol className="space-y-2">
          {(timeline.data ?? []).map((e) => (
            <li key={e.id} className="flex gap-2">
              <span
                className={clsx(
                  'mt-1.5 h-[5px] w-[5px] shrink-0 rounded-full',
                  ACTOR_DOT[e.actorType] ?? 'bg-brand',
                )}
              />
              <span>
                <span className="block text-[11.5px] text-ink">{e.text}</span>
                <span className="num font-mono text-[10px] text-ink-3">
                  {fmtWhen(e.at)} · {e.actorType}
                </span>
              </span>
            </li>
          ))}
        </ol>
      </div>
      <div className="space-y-2">
        {th.held && (
          <div className="rounded-lg border border-dashed border-t-orange-line bg-t-orange-soft p-2 text-meta text-t-orange">
            <span className="flex items-center gap-1.5 font-semibold">
              <Pause size={12} /> Insurer clock held at{' '}
              {th.remainingMins !== null ? fmtBizMins(th.remainingMins) : '-'}
            </span>
            {th.pauseReason && <span className="mt-0.5 block text-ink">{th.pauseReason}</span>}
          </div>
        )}
        {th.status === ThreadStatus.DECLINED && (
          <div className="rounded-lg border border-t-red-line bg-t-red-soft p-2 text-meta text-t-red">
            Declined{th.declineReason ? `: ${th.declineReason}` : ''}
          </div>
        )}
        {c && (
          <div className="rounded-lg border border-line-subtle p-2 text-meta">
            <span className="font-semibold text-ink">Insurer asked</span>{' '}
            <span className="text-ink-3">· {fmtWhen(c.askedAt)}</span>
            <p className="mt-0.5 text-ink">{c.question}</p>
            {c.rmResponse && (
              <div className="mt-1.5 rounded-md bg-t-green-soft p-1.5 text-t-green">
                {t.rm.name} replied: {c.rmResponse}
              </div>
            )}
            {c.replyText && (
              <div className="mt-1.5 text-ink-2">
                You replied {c.repliedAt ? fmtWhen(c.repliedAt) : ''}: {c.replyText}
              </div>
            )}
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {th.latestQuote && (
            <Button variant="primary" size="sm" onClick={() => openDocument(th.latestQuote!.documentId)}>
              Download quote
            </Button>
          )}
          <Button size="sm" icon={<PhoneCall size={12} />} onClick={() => setLogging(true)}>
            Log call
          </Button>
        </div>
        <ThreadSims ticket={t} th={th} />
      </div>
      {logging && <LogCallModal ticketId={t.id} th={th} onClose={() => setLogging(false)} />}
    </div>
  );
}

/** Dev only: insurer events on this thread and the RM's answer to a held request. */
function ThreadSims({ ticket: t, th }: { ticket: TicketDetail; th: ThreadView }) {
  const insurer = useDevAction(`/dev/tickets/${t.id}/threads/${th.id}/insurer`);
  const rm = useDevAction(`/dev/tickets/${t.id}/threads/${th.id}/rm-reply`);
  const mail = useDevAction('/dev/mail/inbound');
  const layer = useDevAction(`/dev/tickets/${t.id}/email-layer/deliver`);
  const open = !TERMINAL.includes(th.status);
  return (
    <>
      {th.status === ThreadStatus.AWAITING_RM && !th.clarification?.rmResponse && (
        <DevSimBlock title="Simulate RM response">
          <DevSimBtn
            disabled={rm.isPending}
            onClick={() => rm.mutate({ text: 'Claims history for the last three years is attached.' })}
          >
            RM replied
          </DevSimBtn>
        </DevSimBlock>
      )}
      {open && (
        <DevSimBlock title="Simulate insurer response">
          <DevSimBtn
            disabled={insurer.isPending}
            onClick={() => insurer.mutate({ kind: 'ack', text: 'Received, reviewing.' })}
          >
            Acknowledged
          </DevSimBtn>
          <DevSimBtn
            disabled={insurer.isPending}
            onClick={() =>
              insurer.mutate({
                kind: 'clarification',
                text: 'Please share the last three years of claims experience.',
              })
            }
          >
            Clarification raised
          </DevSimBtn>
          <DevSimBtn disabled={insurer.isPending} onClick={() => insurer.mutate({ kind: 'quote' })}>
            Quote received
          </DevSimBtn>
          <DevSimBtn
            disabled={insurer.isPending}
            onClick={() => insurer.mutate({ kind: 'decline', text: 'Outside our appetite for this risk.' })}
          >
            Declined
          </DevSimBtn>
          {th.pocs[0] && (
            <DevSimBtn
              disabled={mail.isPending}
              title="An ambiguous reply: lands in Manual Review, changes nothing"
              onClick={() =>
                mail.mutate({
                  from: th.pocs[0].email,
                  subject: `RE: [${t.ticketNo} | ${th.threadRef}] RFQ`,
                  textBody: 'Noted. We will revert on this shortly.',
                })
              }
            >
              Unclear mail
            </DevSimBtn>
          )}
          <DevSimBtn
            disabled={layer.isPending}
            title="A colleague answers the insurer from their own Gmail (email layer delivery): resumes a held thread, sends no mail"
            onClick={() => layer.mutate({ threadId: th.id, kind: 'colleague' })}
          >
            Colleague replies from Gmail
          </DevSimBtn>
          <DevSimBtn
            disabled={layer.isPending}
            title="The insurer's mail arrives with no Placement email chain: lands in Manual Review, changes nothing"
            onClick={() => layer.mutate({ threadId: th.id, kind: 'unanchored' })}
          >
            Unchained insurer mail
          </DevSimBtn>
        </DevSimBlock>
      )}
    </>
  );
}

function TextModal({
  ticketId,
  path,
  field,
  title,
  subtitle,
  cta,
  initial,
  onClose,
}: {
  ticketId: string;
  path: string;
  field: string;
  title: string;
  subtitle: string;
  cta: string;
  initial: string;
  onClose: () => void;
}) {
  const [text, setText] = useState(initial);
  const cmd = useTicketCommand<Record<string, string>>(ticketId, 'POST', path);
  return (
    <Modal
      title={title}
      subtitle={subtitle}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!text.trim() || cmd.isPending}
            onClick={() => cmd.mutate({ [field]: text.trim() }, { onSuccess: onClose })}
          >
            {cta}
          </Button>
        </>
      }
    >
      <textarea
        className="w-full rounded-lg border border-line px-2.5 py-2 text-dense"
        rows={4}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {cmd.error && <p className="mt-2 text-dense text-t-red">{cmd.error.message}</p>}
    </Modal>
  );
}

function LogCallModal({ ticketId, th, onClose }: { ticketId: string; th: ThreadView; onClose: () => void }) {
  const [outcome, setOutcome] = useState('');
  const [notes, setNotes] = useState('');
  const cmd = useTicketCommand<{ outcome: string; notes?: string }>(
    ticketId,
    'POST',
    `/threads/${th.id}/calls`,
  );
  return (
    <Modal
      title={`Log call · ${th.insurer.name}`}
      subtitle={`${th.threadRef} · logged on the thread history and the audit trail.`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!outcome.trim() || cmd.isPending}
            onClick={() =>
              cmd.mutate(
                { outcome: outcome.trim(), notes: notes.trim() || undefined },
                { onSuccess: onClose },
              )
            }
          >
            Log call
          </Button>
        </>
      }
    >
      <label className="block text-dense">
        <span className="mb-1 block font-medium">Outcome</span>
        <input
          className="w-full rounded-lg border border-line px-2.5 py-2"
          placeholder="e.g. Underwriter will quote by Friday"
          value={outcome}
          onChange={(e) => setOutcome(e.target.value)}
        />
      </label>
      <label className="mt-3 block text-dense">
        <span className="mb-1 block font-medium">Notes (optional)</span>
        <textarea
          className="w-full rounded-lg border border-line px-2.5 py-2"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>
      {cmd.error && <p className="mt-2 text-dense text-t-red">{cmd.error.message}</p>}
    </Modal>
  );
}
