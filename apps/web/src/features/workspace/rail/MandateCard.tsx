import { Star } from 'lucide-react';
import { useState } from 'react';
import { Stage, type MandateView, type TicketDetail } from '@bimaplacement/contracts';
import { Avatar, Button, Modal, StatusPill } from '@/design-system/components';
import { DevSimBlock, DevSimBtn, useDevTools } from '@/dev/DevTools';
import { useInsurers, useLookup, useTicketCommand, useTicketSub } from '@/api/hooks';
import { fmtWhen } from '@/lib/format';

type Req = MandateView['requests'][number];
const first = (name: string) => name.split(' ')[0];

/**
 * PlMandateCard (UI-SPEC 3.3.12, PLAN 3.6): Exclusive Placement Mandate request on the rail. Hidden when
 * closed or signed. For information only: never changes insurers, quotes, the QCR or the status (BR-136).
 */
export function MandateCard({ ticket: t }: { ticket: TicketDetail }) {
  const { data: m } = useTicketSub<MandateView>(t.id, 'mandate');
  const [modal, setModal] = useState<'request' | 'remind' | 'withdraw' | null>(null);
  if (!m || t.stage === Stage.CLOSED || m.state === 'signed') return null;
  const last = m.requests[0];
  const rm = first(t.rm.name);

  return (
    <div className="rounded-xl border border-t-orange-line bg-white p-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-ink">
          <Star size={13} className="text-accent" /> Exclusive Mandate
        </span>
        {m.state === 'requested' && <StatusPill ind="caution">Requested</StatusPill>}
        {m.state === 'considering' && <StatusPill ind="caution">Client considering</StatusPill>}
        {m.state === 'declined' && <StatusPill ind="error">Declined</StatusPill>}
      </div>

      {m.state === 'none' && (
        <>
          <p className="mt-2 text-dense font-medium text-ink">
            Ask {rm} for the client&apos;s Exclusive Placement Mandate.
          </p>
          <p className="mt-1 text-meta text-ink-2">
            For information only - it doesn&apos;t change insurers, quotes or the QCR.
          </p>
          <Button variant="primary" size="sm" full className="mt-3" onClick={() => setModal('request')}>
            Request mandate
          </Button>
        </>
      )}

      {(m.state === 'requested' || m.state === 'considering') && last && (
        <>
          <p className="mt-2 text-dense font-medium text-ink">
            {m.state === 'considering' ? 'Client is still considering' : `Waiting on ${t.rm.name}`}
          </p>
          <LatestResponse req={last} rm={t.rm} />
          <dl className="mt-2 space-y-1 text-meta text-ink-2">
            <div>
              Requested by {first(last.requestedByName)} · {fmtWhen(last.requestedAt)}
            </div>
            {last.preferredInsurerName && (
              <div>
                Preferred insurer: <b className="text-ink">{last.preferredInsurerName}</b>
              </div>
            )}
            <div>
              Reason: <b className="text-ink">{last.reason}</b>
            </div>
            <Reminders req={last} />
          </dl>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button size="sm" onClick={() => setModal('remind')}>
              Send reminder
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setModal('withdraw')}>
              Withdraw
            </Button>
          </div>
          <RmResponseSim ticketId={t.id} considering={m.state === 'considering'} />
        </>
      )}

      {m.state === 'declined' && last && (
        <>
          <p className="mt-2 text-dense font-medium text-ink">
            Declined by {t.rm.name} · {last.closedAt ? fmtWhen(last.closedAt) : ''}
          </p>
          {last.events.find((e) => e.kind === 'declined')?.reason && (
            <p className="mt-1 text-meta text-ink-2">
              {last.events.find((e) => e.kind === 'declined')?.reason}
            </p>
          )}
          <Button variant="primary" size="sm" full className="mt-3" onClick={() => setModal('request')}>
            Request again
          </Button>
        </>
      )}

      {modal === 'request' && (
        <RequestMandateModal
          ticket={t}
          prefill={m.state === 'declined' ? last : undefined}
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'remind' && (
        <NoteModal
          ticketId={t.id}
          path="/mandate/requests/remind"
          title="Send mandate reminder"
          subtitle={`Mail ${t.rm.name} a reminder about ${last?.ref ?? 'the request'}.`}
          cta="Send reminder"
          placeholder="Optional note to the RM"
          onClose={() => setModal(null)}
        />
      )}
      {modal === 'withdraw' && (
        <NoteModal
          ticketId={t.id}
          path="/mandate/requests/withdraw"
          title="Withdraw mandate request"
          subtitle="The RM is told by mail. You can request again later."
          cta="Withdraw request"
          placeholder="Why are you withdrawing it?"
          danger
          onClose={() => setModal(null)}
        />
      )}
    </div>
  );
}

function LatestResponse({ req, rm }: { req: Req; rm: TicketDetail['rm'] }) {
  const reply = [...req.events].reverse().find((e) => e.kind === 'considering' && e.note);
  if (!reply) return null;
  return (
    <div className="mt-2 rounded-lg bg-t-orange-soft p-2">
      <div className="flex items-center gap-1.5 text-meta font-medium text-ink-2">
        <Avatar name={rm.name} src={rm.avatarUrl} size={18} tone="blue" /> {rm.name} · {fmtWhen(reply.at)}
      </div>
      <p className="mt-1 line-clamp-2 text-meta text-ink">{reply.note}</p>
    </div>
  );
}

function Reminders({ req }: { req: Req }) {
  const reminders = req.events.filter((e) => e.kind === 'reminder');
  if (!reminders.length) return null;
  return (
    <div>
      {reminders.length} reminder{reminders.length > 1 ? 's' : ''} sent · last{' '}
      {fmtWhen(reminders[reminders.length - 1].at)}
    </div>
  );
}

/** Dev only: the RM's reply to the request (prototype PlMandateRmSimBlock). */
function RmResponseSim({ ticketId, considering }: { ticketId: string; considering: boolean }) {
  const respond = useTicketCommand<{ kind: string; note?: string; declineReason?: string }>(
    ticketId,
    'POST',
    '/mandate/requests/response',
  );
  const decline = useLookup('mandate_decline_reason')[0] ?? 'Client wants to see all options and decide';
  const { reportError } = useDevTools();
  return (
    <DevSimBlock title="Simulate RM response to mandate request">
      {!considering && (
        <DevSimBtn
          disabled={respond.isPending}
          onClick={() =>
            respond.mutate(
              { kind: 'considering', note: "Client's CFO is reviewing; expect an answer Monday." },
              { onError: reportError },
            )
          }
        >
          Client still considering
        </DevSimBtn>
      )}
      <DevSimBtn
        disabled={respond.isPending}
        onClick={() =>
          respond.mutate(
            { kind: 'signed', note: 'Client signed the Exclusive Placement Mandate.' },
            { onError: reportError },
          )
        }
      >
        Client signed
      </DevSimBtn>
      <DevSimBtn
        disabled={respond.isPending}
        onClick={() => respond.mutate({ kind: 'declined', declineReason: decline }, { onError: reportError })}
      >
        Client declined
      </DevSimBtn>
    </DevSimBlock>
  );
}

function RequestMandateModal({
  ticket: t,
  prefill,
  onClose,
}: {
  ticket: TicketDetail;
  prefill?: Req;
  onClose: () => void;
}) {
  const reasons = useLookup('mandate_request_reason');
  const insurers = useInsurers();
  const [reason, setReason] = useState(prefill?.reason ?? '');
  const [preferred, setPreferred] = useState(prefill?.preferredInsurerId ?? '');
  const [message, setMessage] = useState(
    prefill?.message ??
      `Hi ${first(t.rm.name)}, could the client sign an Exclusive Placement Mandate so we can choose the best option for them?`,
  );
  const request = useTicketCommand<{ reason: string; preferredInsurerId?: string; message: string }>(
    t.id,
    'POST',
    '/mandate/requests',
  );
  const missing = [!reason && 'Reason', !message.trim() && 'Message'].filter(Boolean);
  return (
    <Modal
      title="Request Exclusive Placement Mandate"
      subtitle={`Mailed to ${t.rm.name}. For information only - it doesn't change insurers, quotes or the QCR.`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!!missing.length || request.isPending}
            onClick={() =>
              request.mutate(
                { reason, preferredInsurerId: preferred || undefined, message },
                { onSuccess: onClose },
              )
            }
          >
            Send request
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-dense">
        <label className="block">
          <span className="mb-1 block font-medium">Reason</span>
          <select
            className="w-full rounded-lg border border-line px-2.5 py-2"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          >
            <option value="">Pick a reason</option>
            {reasons.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block font-medium">Preferred insurer (optional)</span>
          <select
            className="w-full rounded-lg border border-line px-2.5 py-2"
            value={preferred}
            onChange={(e) => setPreferred(e.target.value)}
          >
            <option value="">No preferred insurer</option>
            {(insurers.data ?? [])
              .filter((i) => i.status === 'Active')
              .map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block font-medium">Message</span>
          <textarea
            className="w-full rounded-lg border border-line px-2.5 py-2"
            rows={4}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </label>
        {request.error && <p className="text-t-red">{request.error.message}</p>}
      </div>
    </Modal>
  );
}

function NoteModal({
  ticketId,
  path,
  title,
  subtitle,
  cta,
  placeholder,
  danger,
  onClose,
}: {
  ticketId: string;
  path: string;
  title: string;
  subtitle: string;
  cta: string;
  placeholder: string;
  danger?: boolean;
  onClose: () => void;
}) {
  const [note, setNote] = useState('');
  const cmd = useTicketCommand<{ note?: string }>(ticketId, 'POST', path);
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
            variant={danger ? 'danger' : 'primary'}
            disabled={cmd.isPending}
            onClick={() => cmd.mutate({ note: note.trim() || undefined }, { onSuccess: onClose })}
          >
            {cta}
          </Button>
        </>
      }
    >
      <textarea
        className="w-full rounded-lg border border-line px-2.5 py-2 text-dense"
        rows={3}
        placeholder={placeholder}
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      {cmd.error && <p className="mt-2 text-dense text-t-red">{cmd.error.message}</p>}
    </Modal>
  );
}
