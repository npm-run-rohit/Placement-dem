import { Banknote, Briefcase, Star, User } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import {
  OutcomeType,
  PRODUCT_TYPES_SEED,
  Stage,
  type MandateView,
  type TicketDetail,
} from '@bimaplacement/contracts';
import { Avatar, Button, Modal, StatusPill } from '@/design-system/components';
import type { Ind } from '@/design-system/tokens';
import { useTicketCommand, useTicketSub } from '@/api/hooks';
import { fmtInrShort, fmtWhen } from '@/lib/format';

const OUTCOME_PILL: Record<OutcomeType, { label: string; ind: Ind }> = {
  [OutcomeType.QUOTE_SELECTED]: { label: 'Quote Selected', ind: 'success' },
  [OutcomeType.LOST]: { label: 'Lost', ind: 'error' },
  [OutcomeType.NO_APPETITE]: { label: 'No appetite', ind: 'neutral' },
};

/** Header status pill tone (UI-SPEC 3.3): outcome, else by the internal status wording. */
function statusPill(t: TicketDetail): { label: string; ind: Ind } {
  if (t.outcome) return OUTCOME_PILL[t.outcome];
  const s = t.internalStatus;
  if (/Clarification|Awaiting RM/.test(s)) return { label: s, ind: 'caution' };
  if (/Release|QCR/.test(s)) return { label: s, ind: 'info' };
  if (/Review/.test(s)) return { label: s, ind: 'caution' };
  return { label: s, ind: 'info' };
}

/** Hover tooltip naming the field (MetaHover). */
function Meta({ title, icon, children }: { title: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <span className="flex items-center gap-1.5" title={title}>
      {icon}
      {children}
    </span>
  );
}

/**
 * Workspace header (UI-SPEC 3.3, PLAN 1.6): ticket no + mandate pill (hover details) + status pill; client,
 * product, RM, Placement Manager (= owner), Target Premium with Add / Edit; business type, participants and
 * Contact RM; Ikkat rule.
 */
export function WorkspaceHeader({ ticket: t }: { ticket: TicketDetail }) {
  const { data: mandate } = useTicketSub<MandateView>(t.id, 'mandate');
  const [editingTarget, setEditingTarget] = useState(false);
  const status = statusPill(t);
  const product = PRODUCT_TYPES_SEED.find((p) => p.code === t.productType);
  const closed = t.stage === Stage.CLOSED;
  const people = [
    { name: t.owner.name, role: 'Placement Manager', src: t.owner.avatarUrl, tone: 'purple' as const },
    { name: t.rm.name, role: 'RM', src: t.rm.avatarUrl, tone: 'blue' as const },
    ...(t.clientSpoc
      ? [{ name: t.clientSpoc.split(',')[0], role: 'Client SPOC', src: null, tone: 'green' as const }]
      : []),
  ];
  const mail = t.rm.email
    ? `mailto:${t.rm.email}?subject=${encodeURIComponent(`[${t.ticketNo}] ${t.businessName} · ${product?.short ?? t.productType}`)}`
    : undefined;

  return (
    <div className="px-6 pt-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[28px] font-650 tracking-[-0.5px] text-brand">{t.ticketNo}</span>
        <MandatePill mandate={mandate} />
        <StatusPill size="lg" ind={status.ind}>
          {status.label}
        </StatusPill>
        <span className="ml-auto flex items-center gap-3">
          <StatusPill ind="neutral">{t.businessType}</StatusPill>
          <span className="flex -space-x-1.5">
            {people.map((p) => (
              <span key={p.role} title={`${p.name} · ${p.role}`} className="rounded-full ring-2 ring-white">
                <Avatar name={p.name} src={p.src} size={26} tone={p.tone} />
              </span>
            ))}
          </span>
          {mail ? (
            <a
              href={mail}
              className="rounded-lg border border-line bg-white px-2.5 py-1 text-xs font-semibold text-ink hover:bg-canvas"
            >
              Contact RM
            </a>
          ) : (
            <Button size="sm" disabled title="No RM email on the ticket">
              Contact RM
            </Button>
          )}
        </span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm font-medium">
        <Meta title="Client" icon={<User size={14} />}>
          {t.businessName}
        </Meta>
        <Meta title="Product type" icon={<Briefcase size={14} />}>
          {product?.label ?? t.productType}
        </Meta>
        <Meta
          title="Relationship Manager"
          icon={<Avatar name={t.rm.name} src={t.rm.avatarUrl} size={18} tone="blue" />}
        >
          RM: <b>{t.rm.name}</b>
        </Meta>
        <Meta
          title="Placement Manager (ticket owner)"
          icon={<Avatar name={t.owner.name} src={t.owner.avatarUrl} size={18} />}
        >
          Placement Manager: <b>{t.owner.name}</b>
        </Meta>
        <Meta title="Target premium (optional, never blocks)" icon={<Banknote size={14} />}>
          Target Premium:{' '}
          {t.targetPremium ? (
            <b className="num">{fmtInrShort(t.targetPremium)}</b>
          ) : (
            <span className="text-ink-3">Not provided</span>
          )}
          {!closed && (
            <button
              className="text-brand underline underline-offset-2"
              onClick={() => setEditingTarget(true)}
            >
              {t.targetPremium ? 'Edit' : 'Add'}
            </button>
          )}
        </Meta>
      </div>
      <div className="bk-rule my-5" aria-hidden />
      {editingTarget && <TargetPremiumModal ticket={t} onClose={() => setEditingTarget(false)} />}
    </div>
  );
}

function MandatePill({ mandate }: { mandate?: MandateView }) {
  if (!mandate || mandate.state === 'none' || mandate.state === 'declined') return null;
  if (mandate.state === 'signed') {
    const m = mandate.mandates.find((x) => x.type === 'Exclusive Placement Mandate');
    const tip = m
      ? [
          `${m.reference}`,
          m.requestedByName &&
            `Requested by ${m.requestedByName}${m.requestedAt ? ` · ${fmtWhen(m.requestedAt)}` : ''}`,
          m.signedAt && `Signed ${fmtWhen(m.signedAt)}`,
          m.preferredInsurerName ? `Preferred insurer: ${m.preferredInsurerName}` : 'No preferred insurer',
        ]
          .filter(Boolean)
          .join('\n')
      : undefined;
    return (
      <span title={tip}>
        <StatusPill size="lg" ind="caution" leading={<Star size={14} className="fill-accent text-accent" />}>
          Exclusive Mandate
        </StatusPill>
      </span>
    );
  }
  const r = mandate.requests[0];
  const tip = r
    ? `${r.ref} · requested by ${r.requestedByName} · ${fmtWhen(r.requestedAt)}\nReason: ${r.reason}`
    : undefined;
  return (
    <span title={tip}>
      <StatusPill size="lg" ind="neutral" leading={<Star size={14} className="text-ink-3" />}>
        {mandate.state === 'considering' ? 'Mandate: client considering' : 'Mandate requested'}
      </StatusPill>
    </span>
  );
}

/** PlTargetPremiumModal: blank removes the target (BR-108); en-IN digits; never blocks anything. */
function TargetPremiumModal({ ticket: t, onClose }: { ticket: TicketDetail; onClose: () => void }) {
  const [value, setValue] = useState(t.targetPremium ? String(t.targetPremium) : '');
  const [note, setNote] = useState('');
  const save = useTicketCommand<{ value: number | null; note?: string }>(t.id, 'PUT', '/target-premium');
  const digits = value.replace(/[^\d]/g, '');
  const amount = digits ? Number(digits) : null;
  return (
    <Modal
      title={t.targetPremium ? 'Edit target premium' : 'Add target premium'}
      subtitle="Optional. Used only for the Target Met / Above Target flag on quotes; it never blocks the ticket."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={save.isPending}
            onClick={() =>
              save.mutate({ value: amount, note: note.trim() || undefined }, { onSuccess: onClose })
            }
          >
            {amount === null && t.targetPremium ? 'Remove target' : 'Save'}
          </Button>
        </>
      }
    >
      <label className="block text-dense">
        <span className="mb-1 block font-medium">Target premium (₹, incl. GST)</span>
        <input
          inputMode="numeric"
          className="num w-full rounded-lg border border-line px-2.5 py-2 text-right"
          placeholder="e.g. 7800000"
          value={amount === null ? '' : new Intl.NumberFormat('en-IN').format(amount)}
          onChange={(e) => setValue(e.target.value)}
        />
      </label>
      <label className="mt-3 block text-dense">
        <span className="mb-1 block font-medium">Note (optional)</span>
        <input
          className="w-full rounded-lg border border-line px-2.5 py-2"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      {save.error && <p className="mt-2 text-dense text-t-red">{save.error.message}</p>}
    </Modal>
  );
}
