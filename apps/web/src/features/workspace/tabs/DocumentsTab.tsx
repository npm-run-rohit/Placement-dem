import { FileText, Link2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  QcrStatus,
  QuoteDecision,
  type QcrView,
  type QuoteView,
  type DocumentView,
  type RfqVersionView,
  type Tone,
} from '@bimaplacement/contracts';
import { Button, Chip, FilterPills } from '@/design-system/components';
import { useTicketSub } from '@/api/hooks';
import { api, openDocument } from '@/lib/api-client';
import { fmtWhen } from '@/lib/format';
import { TabHeader } from './TabHeader';
import type { TabProps } from '../TicketWorkspace';

type Sub = 'internal' | 'external';

const kb = (bytes: string) => {
  const n = Number(bytes);
  return n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
};

const QUOTE_CHIP = (q: QuoteView, activeRfq: number): [string, Tone] =>
  q.rfqVersion !== activeRfq || q.decision === QuoteDecision.SUPERSEDED
    ? ['Superseded', 'neutral']
    : q.decision === QuoteDecision.USABLE
      ? ['Usable', 'green']
      : q.decision === QuoteDecision.EXCLUDED
        ? ['Excluded', 'red']
        : q.decision === QuoteDecision.CLARIFICATION
          ? ['Needs Clarification', 'orange']
          : ['Awaiting Decision', 'purple'];

const QCR_CHIP: Record<string, [string, Tone]> = {
  [QcrStatus.RELEASED]: ['Released', 'green'],
  [QcrStatus.SUPERSEDED]: ['Superseded', 'neutral'],
  [QcrStatus.DRAFT]: ['Draft', 'blue'],
};

/** Documents (UI-SPEC 3.3.5, PLAN 3.7): Internal = RFQ versions; External = insurer quote PDFs + QCR versions. Real files only, no placeholders. */
export function DocumentsTab({ ticket: t }: TabProps) {
  const [sub, setSub] = useState<Sub>('internal');
  const { data: docs = [] } = useQuery({
    queryKey: ['ticket', t.id, 'documents'],
    queryFn: () => api<DocumentView[]>(`/documents/ticket/${t.id}`),
  });
  const { data: versions = [] } = useTicketSub<RfqVersionView[]>(t.id, 'rfq/versions');
  const { data: quotes = [] } = useTicketSub<QuoteView[]>(t.id, 'quotes');
  const { data: qcrs = [] } = useTicketSub<QcrView[]>(t.id, 'qcrs');
  const docById = new Map(docs.map((d) => [d.id, d]));

  const internal: ReactNode[] = [...versions]
    .sort((a, b) => b.version - a.version)
    .flatMap((v) => {
      const rows: ReactNode[] = [];
      const excel = v.excelDocumentId ? docById.get(v.excelDocumentId) : undefined;
      if (excel)
        rows.push(
          <DocRowView
            key={excel.id}
            name={excel.fileName}
            sub={`RFQ V${v.version} · Excel · ${kb(excel.sizeBytes)} · ${fmtWhen(excel.uploadedAt)}`}
            docId={excel.id}
          />,
        );
      if (v.linkUrl)
        rows.push(
          <DocRowView
            key={`${v.id}-link`}
            name={`RFQ V${v.version} link`}
            sub={v.linkUrl}
            href={v.linkUrl}
          />,
        );
      return rows;
    });
  const otherInternal = docs.filter(
    (d) => d.visibility === 'internal' && !versions.some((v) => v.excelDocumentId === d.id),
  );
  internal.push(
    ...otherInternal.map((d) => (
      <DocRowView
        key={d.id}
        name={d.fileName}
        sub={`${d.kind.replace(/_/g, ' ')} · ${kb(d.sizeBytes)} · ${fmtWhen(d.uploadedAt)}`}
        docId={d.id}
      />
    )),
  );

  const external: ReactNode[] = [
    ...[...qcrs]
      .sort((a, b) => b.version - a.version)
      .filter((q) => q.documentId)
      .map((q) => {
        const [label, tone] = QCR_CHIP[q.status] ?? [
          q.copycatStatus === 'failed' ? 'Failed' : 'Generating',
          q.copycatStatus === 'failed' ? 'red' : 'neutral',
        ];
        return (
          <DocRowView
            key={q.id}
            name={q.fileName ?? `QCR V${q.version}`}
            sub={`QCR Version ${q.version}${q.releasedAt ? ` · released ${fmtWhen(q.releasedAt)}` : ` · ${fmtWhen(q.createdAt)}`}`}
            chip={<Chip tone={tone}>{label}</Chip>}
            docId={q.documentId!}
          />
        );
      }),
    ...[...quotes]
      .sort((a, b) => b.receivedAt.localeCompare(a.receivedAt))
      .map((q) => {
        const [label, tone] = QUOTE_CHIP(q, t.activeRfqVersion);
        return (
          <DocRowView
            key={q.id}
            name={q.fileName}
            sub={`${q.insurer.name} · Quote V${q.version} against RFQ V${q.rfqVersion} · ${fmtWhen(q.receivedAt)}`}
            chip={<Chip tone={tone}>{label}</Chip>}
            docId={q.documentId}
          />
        );
      }),
  ];

  const total = internal.length + external.length;
  return (
    <div>
      <TabHeader
        title="Documents"
        meta={`${total} documents · ${internal.length} internal · ${external.length} external`}
      />
      <div className="mb-4">
        <FilterPills<Sub>
          value={sub}
          onChange={setSub}
          items={[
            { key: 'internal', label: 'Internal', count: internal.length },
            { key: 'external', label: 'External', count: external.length },
          ]}
        />
      </div>
      {sub === 'internal' ? (
        internal.length ? (
          <ol>{internal}</ol>
        ) : (
          <div className="text-dense text-ink-2">No RFQ documents yet.</div>
        )
      ) : external.length ? (
        <ol>{external}</ol>
      ) : (
        <div className="text-dense text-ink-2">
          No external documents yet. Insurer quote PDFs and QCR versions appear here as the ticket moves
          through the workflow.
        </div>
      )}
    </div>
  );
}

function DocRowView({
  name,
  sub,
  chip,
  docId,
  href,
}: {
  name: string;
  sub: string;
  chip?: ReactNode;
  docId?: string;
  href?: string;
}) {
  return (
    <li className="flex items-center gap-3 py-3 [&+li]:border-t [&+li]:border-line-soft">
      <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-md bg-[rgba(65,0,207,0.08)] text-brand">
        {href ? <Link2 size={14} /> : <FileText size={14} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-dense font-semibold text-placement">{name}</span>
        <span className="block truncate text-meta text-ink-3">{sub}</span>
      </span>
      {chip}
      {docId && (
        <span className="flex shrink-0 gap-2">
          <Button size="sm" onClick={() => openDocument(docId, 'view')}>
            View
          </Button>
          <Button size="sm" onClick={() => openDocument(docId)}>
            Download
          </Button>
        </span>
      )}
      {href && (
        <Button size="sm" onClick={() => window.open(href, '_blank', 'noopener')}>
          Open Link
        </Button>
      )}
    </li>
  );
}
