import clsx from 'clsx';
import { Lock, Send, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import {
  EntityLockReason,
  PRODUCT_TYPES_SEED,
  Stage,
  THREAD_STATUS_META,
  type PanelEntityView,
  type ThreadView,
  type TicketDetail,
} from '@bimaplacement/contracts';
import { Button, EmptyState, InsurerMark, Modal, StatusPill } from '@/design-system/components';
import { toneToInd } from '@/design-system/tokens';
import { useTicketCommand, useTicketSub } from '@/api/hooks';
import { uploadDocument } from '@/lib/api-client';
import type { TabProps } from '../TicketWorkspace';
import { AddInsurerModal } from './RevisionCard';

const GROUP_LABEL: Record<string, string> = {
  EB: 'Employee Benefits',
  Liability: 'Liability',
  'P&C': 'Property & Casualty',
};

/**
 * Insurer Panel (UI-SPEC 3.3.6a, PLAN 2.3): before float, every insurer + branch with POCs for the product group,
 * hard locks shown with the reason (FR-212), appetite as a hint only (FR-210), < 3 insurers a warning only
 * (FR-215); Send to insurers -> one thread per entity. After float, the locked approved panel.
 */
export function InsurersTab({ ticket: t }: TabProps) {
  const product = PRODUCT_TYPES_SEED.find((p) => p.code === t.productType);
  if (t.panelLocked) return <LockedPanel ticket={t} />;
  return (
    <SelectionPanel ticket={t} group={product?.group ?? ''} productShort={product?.short ?? t.productType} />
  );
}

function SelectionPanel({
  ticket: t,
  group,
  productShort,
}: TabProps & { group: string; productShort: string }) {
  const { data: entities = [], isLoading } = useTicketSub<PanelEntityView[]>(t.id, 'insurer-entities');
  const toggle = useTicketCommand<{ insurerId: string; branchId: string; selected: boolean }>(
    t.id,
    'PUT',
    '/panel',
  );
  const [confirming, setConfirming] = useState(false);
  const editable = t.stage === Stage.INSURER_SELECTION;
  const selected = entities.filter((e) => e.selected);
  const insurerCount = new Set(selected.map((e) => e.insurerId)).size;

  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-line-subtle bg-card-alt p-3 text-dense text-ink-2">
        Every insurer + branch on the Insurer Master with POCs for {GROUP_LABEL[group] ?? group}. Each
        selection is one thread, and every POC on it gets every mail. Appetite chips are a hint only. Locked
        markets stay visible with the reason.
      </div>
      {!editable && (
        <div className="rounded-xl border border-t-orange-line bg-t-orange-soft p-3 text-dense text-t-orange">
          Validate the RFQ first - insurers can be selected in Insurer Selection.
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-line-subtle bg-white">
        <div className="flex items-center justify-between border-b border-line-soft px-3 py-2.5">
          <span className="text-sm font-semibold">Insurer Master</span>
          <span className="num text-meta text-ink-2">
            {new Set(entities.map((e) => e.insurerId)).size} insurers · {entities.length} entities
          </span>
        </div>
        {isLoading && <div className="p-4 text-dense text-ink-2">Loading…</div>}
        {!isLoading && !entities.length && (
          <div className="p-4">
            <EmptyState title="No insurer has POCs for this product group" />
          </div>
        )}
        {entities.map((e) => (
          <EntityRow
            key={`${e.insurerId}:${e.branchId}`}
            e={e}
            productShort={productShort}
            editable={editable}
            busy={toggle.isPending}
            ticketId={t.id}
            onToggle={(sel) => toggle.mutate({ insurerId: e.insurerId, branchId: e.branchId, selected: sel })}
          />
        ))}
        {toggle.error && (
          <div className="border-t border-line-soft p-3 text-dense text-t-red">{toggle.error.message}</div>
        )}
      </div>

      {editable && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-line bg-brand-50 p-3">
          <div>
            <div className="text-sm font-semibold text-ink">
              {selected.length === insurerCount
                ? `${insurerCount} insurer${insurerCount === 1 ? '' : 's'} selected`
                : `${selected.length} entities across ${insurerCount} insurers selected`}
            </div>
            <div className="text-meta text-ink-2">
              {insurerCount < 3
                ? 'Fewer than 3 insurers makes the usable-quote threshold hard to reach.'
                : 'Sending creates one independent thread per insurer + branch, each with its own SLA.'}
            </div>
          </div>
          <Button
            variant="primary"
            icon={<Send size={14} />}
            disabled={!selected.length}
            onClick={() => setConfirming(true)}
          >
            Send to insurers
          </Button>
        </div>
      )}
      {confirming && <SendModal ticket={t} selected={selected} onClose={() => setConfirming(false)} />}
    </div>
  );
}

function EntityRow({
  e,
  productShort,
  editable,
  busy,
  ticketId,
  onToggle,
}: {
  e: PanelEntityView;
  productShort: string;
  editable: boolean;
  busy: boolean;
  ticketId: string;
  onToggle: (selected: boolean) => void;
}) {
  return (
    <div
      className={clsx(
        'grid grid-cols-[24px_minmax(200px,1fr)_minmax(150px,auto)_168px] items-start gap-3 border-b border-line-soft px-3 py-3 last:border-0',
        e.selected && 'bg-brand-50',
        e.lock && 'opacity-[.72]',
      )}
    >
      <span className="pt-0.5">
        {!e.lock && (
          <input
            type="checkbox"
            className="h-4 w-4 accent-brand"
            checked={e.selected}
            disabled={!editable || busy}
            onChange={(ev) => onToggle(ev.target.checked)}
            aria-label={`Select ${e.label}`}
          />
        )}
        {e.lock && <Lock size={14} className="text-ink-3" />}
      </span>
      <span>
        <span className="flex flex-wrap items-center gap-2 text-dense font-semibold text-ink">
          <InsurerMark name={e.insurerName} logoUrl={e.logoUrl} size={20} />
          {e.logoUrl && <span>{e.insurerName}</span>}
          {e.branchName && <span className="font-medium text-ink-2">- {e.branchName}</span>}
        </span>
        {e.sectors && <span className="mt-0.5 block text-meta text-ink-2">{e.sectors}</span>}
      </span>
      <span className="flex flex-col items-start gap-1.5">
        {e.lock && (
          <StatusPill ind={e.lock === EntityLockReason.DO_NOT_FLOAT ? 'error' : 'neutral'}>
            {e.lock}
          </StatusPill>
        )}
        <StatusPill ind={e.inAppetite ? 'success' : 'error'} variant="outline">
          {productShort} {e.inAppetite ? 'in appetite' : 'not in appetite'}
        </StatusPill>
        {e.priorResponder && (
          <StatusPill ind="info" variant="outline">
            Responded on an earlier RFQ
          </StatusPill>
        )}
        {e.lock === EntityLockReason.INCUMBENT_MANDATE_NEEDED && editable && (
          <IncumbentMandateUpload ticketId={ticketId} />
        )}
      </span>
      <span className="text-meta text-ink-2">
        {e.pocs.length ? e.pocs.map((p) => p.name).join(', ') : 'No POC'}
      </span>
    </div>
  );
}

/** Rollover incumbent (BR-026): upload the Incumbent Approach Mandate to unlock it (PLAN 3.6). */
function IncumbentMandateUpload({ ticketId }: { ticketId: string }) {
  const input = useRef<HTMLInputElement>(null);
  const record = useTicketCommand<{ proofDocumentId: string }>(ticketId, 'POST', '/mandate/incumbent');
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        className="hidden"
        accept=".pdf,.png,.jpg,.jpeg"
        onChange={async (ev) => {
          const file = ev.target.files?.[0];
          if (!file) return;
          setError(null);
          try {
            const doc = await uploadDocument(file, 'mandate_proof', ticketId);
            record.mutate({ proofDocumentId: doc.id }, { onError: (e) => setError(e.message) });
          } catch (e) {
            setError((e as Error).message);
          }
        }}
      />
      <Button
        size="sm"
        icon={<Upload size={12} />}
        disabled={record.isPending}
        onClick={() => input.current?.click()}
      >
        Upload mandate
      </Button>
      {error && <span className="text-meta text-t-red">{error}</span>}
    </>
  );
}

function SendModal({
  ticket: t,
  selected,
  onClose,
}: TabProps & { selected: PanelEntityView[]; onClose: () => void }) {
  const float = useTicketCommand(t.id, 'POST', '/rfq/float');
  return (
    <Modal
      title={`Send RFQ V${t.activeRfqVersion} to ${selected.length} insurer${selected.length === 1 ? '' : 's'}`}
      subtitle={`Mailed from ${t.owner.name}'s mailbox; one independent thread per insurer + branch, every POC in To. The panel locks once sent.`}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon={<Send size={14} />}
            disabled={float.isPending}
            onClick={() => float.mutate(undefined, { onSuccess: onClose })}
          >
            Send to insurers
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        {selected.map((e) => (
          <div
            key={`${e.insurerId}:${e.branchId}`}
            className="flex items-start justify-between gap-3 rounded-lg border border-line-subtle px-3 py-2 text-dense"
          >
            <span className="font-semibold">{e.label}</span>
            <span className="text-right text-meta text-ink-2">
              To: {e.pocs.map((p) => `${p.name} <${p.email}>`).join(', ')}
            </span>
          </div>
        ))}
      </div>
      {float.error && <p className="mt-3 text-dense text-t-red">{float.error.message}</p>}
    </Modal>
  );
}

function LockedPanel({ ticket: t }: { ticket: TicketDetail }) {
  const rfqVersion = t.activeRfqVersion;
  const [adding, setAdding] = useState(false);
  const { data: threads = [] } = useTicketSub<ThreadView[]>(t.id, 'threads');
  const active = threads.filter((x) => x.rfqVersion === rfqVersion);
  return (
    <div className="overflow-hidden rounded-xl border border-line-subtle bg-white">
      <div className="flex items-center justify-between border-b border-line-soft px-3 py-2.5">
        <span>
          <span className="block text-sm font-semibold">Approved insurer panel</span>
          <span className="text-meta text-ink-2">
            Locked when RFQ V{rfqVersion} was sent to insurers. Each insurer + branch runs an independent
            thread.
          </span>
        </span>
        <span className="flex items-center gap-2">
          {t.stage !== Stage.CLOSED && (
            <Button size="sm" onClick={() => setAdding(true)}>
              Add an insurer
            </Button>
          )}
          <StatusPill ind="success" leading={<Lock size={11} />}>
            Locked
          </StatusPill>
        </span>
      </div>
      {adding && <AddInsurerModal ticket={t} onClose={() => setAdding(false)} />}
      {active.map((th) => {
        const meta = THREAD_STATUS_META[th.status];
        return (
          <div
            key={th.id}
            className="flex items-center justify-between gap-3 border-b border-line-soft px-3 py-3 last:border-0"
          >
            <span>
              <InsurerMark name={th.insurer.name} logoUrl={th.insurer.logoUrl} />
              <span className="mt-1 block text-meta text-ink-2">
                {th.pocs.map((p) => p.name).join(', ')}
                {th.branch.name ? ` · ${th.branch.name}` : ''} · {th.threadRef}
              </span>
            </span>
            <StatusPill ind={toneToInd[meta.tone]}>{meta.label}</StatusPill>
          </div>
        );
      })}
    </div>
  );
}
