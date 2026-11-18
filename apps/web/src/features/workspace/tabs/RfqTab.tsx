import {
  CheckCircle2,
  ChevronDown,
  Circle,
  ExternalLink,
  FileSpreadsheet,
  Link as LinkIcon,
  Plus,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BUSINESS_TYPE_SEED,
  Channel,
  PRODUCT_TYPES_SEED,
  RiskTier,
  type DocumentView,
  type MailView,
  type RfqQueryView,
  type RfqVersionView,
  type TicketDetail,
} from '@bimaplacement/contracts';
import { Button, Callout, Card, Chip, KeyValue, Modal } from '@/design-system/components';
import { useTicketCommand, useTicketSub } from '@/api/hooks';
import { api, ApiRequestError, openDocument } from '@/lib/api-client';
import { fmtWhen } from '@/lib/format';
import { DevSimBlock, DevSimBtn, useDevAction } from '@/dev/DevTools';
import type { TabProps } from '../TicketWorkspace';
import { TabHeader } from './TabHeader';

const kb = (bytes: string) => `${Math.max(1, Math.round(Number(bytes) / 1024))} KB`;

/**
 * RFQ tab (UI-SPEC 3.3.3, PRD M2, PLAN 2.1): BimaSetu float card, RFQ summary, versions + change note, the RFQ
 * source (link opened in BimaSetu's rendered view when there is one, FR-013; Excel with view / download), risk
 * tier (gates Validate), queries to the RM (FR-204, BR-111/112) with the RM mail trail on manual tickets, Validate.
 * Nothing is read from the RFQ itself (FR-199).
 */
export function RfqTab({ ticket: t }: TabProps) {
  const { data: versions = [] } = useTicketSub<RfqVersionView[]>(t.id, 'rfq/versions');
  const { data: queries = [] } = useTicketSub<RfqQueryView[]>(t.id, 'rfq/queries');
  const riskTier = useTicketCommand<{ value: RiskTier }>(t.id, 'PUT', '/rfq/risk-tier');
  const validate = useTicketCommand(t.id, 'POST', '/rfq/validate');
  const [asking, setAsking] = useState(false);
  const rfq = versions.find((v) => v.version === t.activeRfqVersion);
  const open = queries.filter((q) => !q.resolved);
  const inReview = t.stage === 'rfq_review';
  const manual = t.channel === Channel.MANUAL;
  const err = [riskTier.error, validate.error].find((e) => e instanceof ApiRequestError) as
    ApiRequestError | undefined;

  return (
    <div className="space-y-3">
      <TabHeader
        title="Request for Quote"
        meta={
          <Chip tone="neutral">
            V{t.activeRfqVersion} of {versions.length || 1}
          </Chip>
        }
      />
      {t.float && <FloatCard ticket={t} />}
      <SummaryCard ticket={t} versions={versions} />
      {versions.length > 1 && <VersionsCard versions={versions} active={t.activeRfqVersion} />}
      {rfq && <SourceCard ticket={t} rfq={rfq} />}

      <Card>
        <div className="text-[13px] font-semibold">Risk tier</div>
        <div className="mt-1 text-meta text-ink-2">
          Selects the insurer quote-collection SLA (LOB x risk tier x case type).
        </div>
        <div className="mt-2 flex gap-2">
          {[RiskTier.PREFERRED, RiskTier.NON_PREFERRED].map((v) => (
            <Button
              key={v}
              size="sm"
              variant={t.riskTier === v ? 'primary' : 'default'}
              disabled={!inReview}
              onClick={() => riskTier.mutate({ value: v })}
            >
              {v}
            </Button>
          ))}
        </div>
      </Card>

      <Card className={open.length ? 'border-t-orange-line' : ''}>
        <div className="flex items-center justify-between gap-3">
          <div className="text-[13px] font-semibold">Queries to the RM</div>
          <div className="flex items-center gap-2">
            <Chip tone={open.length ? 'orange' : 'green'}>
              {queries.length === 0
                ? 'None raised'
                : open.length
                  ? `${open.length} open`
                  : 'All queries resolved'}
            </Chip>
            {inReview && (
              <Button size="sm" variant="primary" onClick={() => setAsking(true)}>
                Raise query to RM
              </Button>
            )}
          </div>
        </div>
        <div className="mt-1 text-meta text-ink-2">
          Optional. Ask {t.rm.name} {manual ? 'by mail' : 'in BimaSetu'} only if the RFQ needs clarification.
          An answer brings the ticket back to RFQ Review; you resolve each query.
        </div>
        {queries.map((q) => (
          <div key={q.id} className="mt-2 flex items-start gap-2 text-dense">
            {q.resolved ? (
              <CheckCircle2 size={16} className="mt-0.5 text-t-green" />
            ) : (
              <Circle size={16} className="mt-0.5 text-t-orange" />
            )}
            <div className="flex-1">
              <div>
                {q.ref} · {q.label}
              </div>
              {q.answer && (
                <div className="text-meta text-ink-2">
                  RM answered {fmtWhen(q.answeredAt)}: {q.answer}
                </div>
              )}
              {q.resolved && <div className="text-meta text-ink-3">Resolved {fmtWhen(q.resolvedAt)}</div>}
              {!q.resolved && q.sendCount > 1 && (
                <div className="text-meta text-ink-3">
                  Sent again {q.sendCount - 1} time{q.sendCount === 2 ? '' : 's'}
                </div>
              )}
            </div>
            {!q.resolved && inReview && <ResolveButton ticketId={t.id} queryId={q.id} />}
          </div>
        ))}
        {!queries.length && (
          <div className="mt-2 text-meta text-ink-3">
            No queries raised on RFQ V{t.activeRfqVersion}. Raise one only if the RFQ needs clarification,
            otherwise validate directly.
          </div>
        )}
        {t.stage === 'awaiting_rm' && (
          <RmAnswerSim ticketId={t.id} queries={queries.filter((q) => !q.resolved && !q.answer)} />
        )}
      </Card>

      {manual && <RmMailsCard ticket={t} />}

      {inReview && (
        <Card alt className="flex items-center justify-between">
          <div>
            <div className="text-[13px] font-semibold">Validate RFQ V{t.activeRfqVersion}</div>
            <div className="text-dense text-ink-2">
              {open.length && !t.riskTier
                ? `${open.length} query(ies) still open. Set risk tier to validate.`
                : open.length
                  ? `${open.length} query(ies) still open.`
                  : t.riskTier
                    ? 'No open queries.'
                    : 'Set risk tier to validate.'}
            </div>
          </div>
          <Button
            variant="primary"
            disabled={!!open.length || !t.riskTier}
            onClick={() => validate.mutate(undefined)}
          >
            Validate RFQ
          </Button>
        </Card>
      )}
      {err && <Callout tone="red">{err.message}</Callout>}
      {asking && <AskRmModal ticket={t} stillOpen={open} onClose={() => setAsking(false)} />}
    </div>
  );
}

/** BimaSetu float card (FR-281): line reference, RM, Exclusive Mandate flag, note to Placement. */
function FloatCard({ ticket: t }: { ticket: TicketDetail }) {
  const f = t.float!;
  return (
    <Card className="grid grid-cols-2 gap-4">
      <div className="col-span-2 text-[13px] font-semibold">BimaSetu float</div>
      <KeyValue k="Line ref" v={<span className="num font-mono">{f.lineRef}</span>} />
      <KeyValue k="RM" v={t.rm.name} />
      <KeyValue k="Exclusive Mandate" v={f.exclusiveMandate ? 'Yes' : 'No'} />
      <KeyValue k="Note to Placement" v={f.noteToPlacement ?? '-'} />
    </Card>
  );
}

/** PlRfqSummaryCard (collapsed by default): what was received, as typed at intake or floated. */
function SummaryCard({ ticket: t, versions }: { ticket: TicketDetail; versions: RfqVersionView[] }) {
  const [open, setOpen] = useState(false);
  const product = PRODUCT_TYPES_SEED.find((p) => p.code === t.productType);
  const meaning = BUSINESS_TYPE_SEED.find((b) => b.value === t.businessType)?.meaning;
  return (
    <Card>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between text-[13px] font-semibold"
        aria-expanded={open}
      >
        RFQ Summary
        <ChevronDown size={16} className={`text-ink-2 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="mt-3 grid grid-cols-2 gap-4">
          <KeyValue k="Source" v={t.float ? `BimaSetu float · ${t.float.lineRef}` : 'Manual ticket'} />
          <KeyValue k="Submitted by" v={t.float ? t.rm.name : t.createdBy.name} />
          <KeyValue k="Received" v={<span className="num">{fmtWhen(t.receivedAt)}</span>} />
          <KeyValue k="RFQ version" v={`V${t.activeRfqVersion} of ${versions.length || 1}`} />
          <KeyValue k="Industry type" v={t.industryType} />
          <KeyValue k="Business type" v={meaning ? `${t.businessType} - ${meaning}` : t.businessType} />
          <KeyValue k="Risk tier" v={t.riskTier ?? 'Not set'} />
          {t.renewalDate && <KeyValue k="Renewal date" v={t.renewalDate} />}
          <KeyValue k="RFQ template" v={product?.rfqTemplate ?? t.productType} />
          <KeyValue k="Client SPOC" v={t.clientSpoc ?? '-'} />
        </div>
      )}
    </Card>
  );
}

function VersionsCard({ versions, active }: { versions: RfqVersionView[]; active: number }) {
  const current = versions.find((v) => v.version === active);
  return (
    <Card>
      <div className="text-[13px] font-semibold">RFQ versions</div>
      <div className="mt-2 flex flex-wrap gap-2">
        {versions.map((v) => (
          <Chip key={v.id} tone={v.version === active ? 'blue' : 'neutral'}>
            V{v.version} · {v.status}
          </Chip>
        ))}
      </div>
      {current?.changeNote && <div className="mt-2 text-dense text-ink-2">Change: {current.changeNote}</div>}
    </Card>
  );
}

/** PlRfqSourceCard: the RFQ as received. A link opens BimaSetu's rendered view when there is one (FR-013). */
function SourceCard({ ticket: t, rfq }: { ticket: TicketDetail; rfq: RfqVersionView }) {
  const { data: docs = [] } = useQuery({
    enabled: !!rfq.excelDocumentId,
    queryKey: ['ticket', t.id, 'documents'],
    queryFn: () => api<DocumentView[]>(`/documents/ticket/${t.id}`),
  });
  const excel = docs.find((d) => d.id === rfq.excelDocumentId);
  const product = PRODUCT_TYPES_SEED.find((p) => p.code === t.productType);
  const view = rfq.renderedViewUrl ?? rfq.linkUrl;
  return (
    <>
      {rfq.linkUrl && (
        <Card>
          <div className="flex items-center gap-2 text-dense font-semibold">
            <LinkIcon size={14} className="text-placement" /> RFQ V{rfq.version} · RFQ link ·{' '}
            {product?.label ?? t.productType}
          </div>
          <div className="mt-1 truncate font-mono text-meta text-ink-2">{rfq.linkUrl}</div>
          <div className="mt-2 flex items-center gap-2">
            <a
              href={view!}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-dense font-medium text-ink hover:border-brand"
            >
              <ExternalLink size={13} /> {rfq.renderedViewUrl ? 'Open in BimaSetu viewer' : 'Open link'}
            </a>
            <span className="text-meta text-ink-3">Read-only. Nothing is read from the RFQ (FR-199).</span>
          </div>
        </Card>
      )}
      {rfq.excelDocumentId && (
        <Card className="flex items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand">
            <FileSpreadsheet size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-meta font-semibold text-ink-2">Excel Document</div>
            <div className="truncate text-dense font-semibold text-placement">
              {excel?.fileName ?? 'RFQ Excel'}
            </div>
            {excel && (
              <div className="num text-meta text-ink-3">
                RFQ V{rfq.version} · {kb(excel.sizeBytes)} · {fmtWhen(excel.uploadedAt)}
              </div>
            )}
          </div>
          <Button size="sm" onClick={() => void openDocument(rfq.excelDocumentId!, 'view')}>
            View
          </Button>
          <Button size="sm" onClick={() => void openDocument(rfq.excelDocumentId!, 'download')}>
            Download
          </Button>
        </Card>
      )}
    </>
  );
}

/** RM query mails on a manual ticket (UI-SPEC 3.3.3 #8): the RM-T01 mails sent and the RM's replies. */
function RmMailsCard({ ticket: t }: { ticket: TicketDetail }) {
  const { data: mails = [] } = useTicketSub<MailView[]>(t.id, 'mails');
  const rmMail = t.rm.email?.toLowerCase();
  const rm = mails.filter(
    (m) =>
      !m.threadId &&
      (m.templateId === 'RM-T01' ||
        (rmMail && (m.from.toLowerCase() === rmMail || m.to.some((x) => x.toLowerCase() === rmMail)))),
  );
  if (!rm.length && t.stage !== 'awaiting_rm') return null;
  return (
    <Card>
      <div className="flex items-center justify-between">
        <div className="text-[13px] font-semibold">RM query mails</div>
        {t.stage === 'awaiting_rm' && <Chip tone="orange">Waiting on {t.rm.name}</Chip>}
      </div>
      {!rm.length && (
        <div className="mt-2 text-meta text-ink-3">The query mail is on its way to {t.rm.name}.</div>
      )}
      {rm.map((m) => (
        <div
          key={m.id}
          className={`mt-2 rounded-lg p-3 ${m.direction === 'outbound' ? 'bg-brand-50' : 'bg-card-alt'}`}
        >
          <div className="flex justify-between text-meta text-ink-2">
            <span className="font-semibold text-ink">{m.direction === 'outbound' ? 'You' : t.rm.name}</span>
            <span className="num">{fmtWhen(m.at)}</span>
          </div>
          <div className="mt-1 text-dense font-medium">{m.subject}</div>
          {/* bodyHtml is escaped server-side (mail handler / inbound recorder), as on the Mail Trail */}
          <div
            className="mt-1 text-dense text-ink-2 [&_br]:block"
            dangerouslySetInnerHTML={{ __html: m.bodyHtml }}
          />
        </div>
      ))}
    </Card>
  );
}

/** PlAskRmModal: one or more query lines; on a manual ticket a message too (prefilled), sent as RM-T01 by mail. */
function AskRmModal({
  ticket: t,
  stillOpen,
  onClose,
}: {
  ticket: TicketDetail;
  stillOpen: RfqQueryView[];
  onClose: () => void;
}) {
  const manual = t.channel === Channel.MANUAL;
  const [lines, setLines] = useState<string[]>(['']);
  const [message, setMessage] = useState(''); // appended to the RM-T01 mail, which already opens and lists the points
  const raise = useTicketCommand<{ newQueries: string[]; message?: string }>(t.id, 'POST', '/rfq/queries');
  const fresh = lines.map((l) => l.trim()).filter(Boolean);
  // a floated ticket needs at least one new query; a manual one may simply re-send the still-open ones (BR-112)
  const ready = fresh.length > 0 || (manual && stillOpen.length > 0);
  return (
    <Modal
      title="Raise query to RM"
      subtitle={manual ? `Mail to ${t.rm.name} from your mailbox` : `Shown to ${t.rm.name} in BimaSetu`}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!ready || raise.isPending}
            onClick={() =>
              raise.mutate(
                { newQueries: fresh, message: manual && message.trim() ? message.trim() : undefined },
                { onSuccess: onClose },
              )
            }
          >
            {manual ? 'Send mail' : 'Raise in BimaSetu'}
          </Button>
        </>
      }
    >
      <div className="space-y-2">
        {lines.map((l, i) => (
          <div key={i} className="flex gap-2">
            <input
              autoFocus={i === lines.length - 1}
              className="focus-ring flex-1 rounded-lg border border-line px-3 py-1.5 text-dense"
              placeholder="What is missing from the RFQ?"
              value={l}
              onChange={(e) => setLines(lines.map((x, j) => (j === i ? e.target.value : x)))}
            />
            {lines.length > 1 && (
              <button
                onClick={() => setLines(lines.filter((_, j) => j !== i))}
                aria-label="Remove query"
                className="rounded-lg p-1.5 text-ink-3 hover:text-ink"
              >
                <X size={14} />
              </button>
            )}
          </div>
        ))}
        <button
          onClick={() => setLines([...lines, ''])}
          className="inline-flex items-center gap-1 text-dense font-medium text-brand hover:underline"
        >
          <Plus size={13} /> Add another query
        </button>
        {manual && stillOpen.length > 0 && (
          <div className="text-meta text-ink-2">
            Still open and included again: {stillOpen.map((q) => q.ref).join(', ')}.
          </div>
        )}
        {manual && (
          <label className="mt-2 block text-xs font-semibold text-ink-2">
            Note to the RM (optional)
            <textarea
              rows={3}
              className="focus-ring mt-1 w-full rounded-lg border border-line px-3 py-2 text-dense font-normal text-ink"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
          </label>
        )}
        <Callout tone="orange">
          The ticket moves to RFQ Clarification until {t.rm.name} answers. The clock then waits on the RM (1
          business day), not on you.
        </Callout>
        {raise.error && <p className="text-dense text-t-red">{raise.error.message}</p>}
      </div>
    </Modal>
  );
}

/** Stand-in for the RM's answer (mail on a manual ticket, BimaSetu query_answer on a floated one). Dev only. */
function RmAnswerSim({ ticketId, queries }: { ticketId: string; queries: RfqQueryView[] }) {
  const sim = useDevAction(`/dev/tickets/${ticketId}/rm-reply`);
  return (
    <DevSimBlock title="Simulate RM answer">
      {queries.map((q) => (
        <DevSimBtn
          key={q.id}
          disabled={sim.isPending}
          onClick={() =>
            sim.mutate({ queryRef: q.ref, text: `Answer to ${q.ref}: details shared by the client.` })
          }
        >
          RM answered {q.ref}
        </DevSimBtn>
      ))}
      {!queries.length && (
        <DevSimBtn
          disabled={sim.isPending}
          onClick={() => sim.mutate({ text: 'Details shared by the client.' })}
        >
          RM replied
        </DevSimBtn>
      )}
    </DevSimBlock>
  );
}

function ResolveButton({ ticketId, queryId }: { ticketId: string; queryId: string }) {
  const resolve = useTicketCommand(ticketId, 'POST', `/rfq/queries/${queryId}/resolve`);
  return (
    <Button size="sm" onClick={() => resolve.mutate(undefined)}>
      Mark resolved
    </Button>
  );
}
