import { ArrowRight, Clock, Search, User, X } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import {
  PRODUCT_TYPES_SEED,
  STAGE_META,
  Stage,
  type SearchScope,
  type SearchView,
  type TicketListItem,
} from '@bimaplacement/contracts';
import { EmptyState, StatusPill } from '@/design-system/components';
import { SlaCountdown } from '@/design-system/components/SlaCountdown';
import { ink, tone, toneToInd } from '@/design-system/tokens';
import { api } from '@/lib/api-client';
import { stripCompanySuffix } from '@/lib/format';

const SCOPES: Array<{ key: SearchScope; label: string }> = [
  { key: 'tickets', label: 'Tickets' },
  { key: 'clients', label: 'Clients' },
  { key: 'insurers', label: 'Insurers' },
];
const productLabel = (code: string) => PRODUCT_TYPES_SEED.find((p) => p.code === code)?.label ?? code;

/** Sidebar search (UI-SPEC 2.5, PLAN 1.8): GET /search over tickets, clients and insurers the user can see. */
export function SearchModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [scopes, setScopes] = useState<SearchScope[]>(SCOPES.map((s) => s.key));
  const term = useDebounced(q.trim(), 200);
  const { data } = useQuery({
    queryKey: ['search', term, scopes],
    queryFn: () => api<SearchView>(`/search?q=${encodeURIComponent(term)}&scopes=${scopes.join(',')}`),
    placeholderData: keepPreviousData,
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const open = (t: TicketListItem) => {
    onClose();
    navigate(`/tickets/${t.ticketNo}`);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-6"
      style={{ background: 'rgba(28,29,31,0.45)' }}
      onMouseDown={onClose}
    >
      <div
        className="animate-modal mt-6 max-h-[86vh] w-full max-w-[1000px] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Search"
      >
        <div className="flex h-12 items-center gap-2 rounded-xl border-[0.5px] border-line px-3 focus-within:border-brand">
          <Search size={18} className="text-ink-3" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search Tickets, Clients, And Insurers"
            className="h-full flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink-3"
          />
          {q && (
            <button
              onClick={() => setQ('')}
              aria-label="Clear search"
              className="rounded p-1 text-ink-3 hover:text-ink"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="mt-4 text-sm font-medium text-ink-3">Searching For</div>
        <div className="mt-2 flex flex-wrap gap-2">
          {SCOPES.map((s) => {
            const on = scopes.includes(s.key);
            return (
              <button
                key={s.key}
                onClick={() => setScopes(on ? scopes.filter((x) => x !== s.key) : [...scopes, s.key])}
                className={`flex items-center gap-2 rounded-lg border-[0.5px] px-2.5 py-1.5 text-[13px] font-medium ${on ? 'border-line text-ink' : 'border-dashed border-line text-ink-3'}`}
              >
                {s.label}
                {on ? <X size={12} className="text-ink-3" /> : <span className="text-ink-3">+</span>}
              </button>
            );
          })}
        </div>

        <div className="my-4 h-px bg-line-soft" aria-hidden />
        <div className="text-sm font-medium text-ink-3">
          {(data?.recent ?? !term) ? 'Recent Tickets' : 'Results'}
        </div>
        <div className="mt-3 grid gap-4 md:grid-cols-3">
          {data?.items.map((t) => (
            <SearchCard key={t.id} t={t} q={term} onOpen={() => open(t)} />
          ))}
          {data && !data.items.length && (
            <div className="md:col-span-3">
              <EmptyState
                icon={<Search size={20} />}
                title="No matches"
                body={
                  scopes.length
                    ? `No tickets match “${term}”.`
                    : 'Pick at least one of Tickets, Clients or Insurers.'
                }
              />
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function SearchCard({ t, q, onOpen }: { t: TicketListItem; q: string; onOpen: () => void }) {
  const meta = STAGE_META[t.stage];
  return (
    <div
      className="flex flex-col gap-2.5 rounded-xl border-[0.5px] border-line p-4"
      style={{ background: `linear-gradient(180deg, ${tone.purple.bg} 0%, ${ink.white} 60%)` }}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="num text-lg font-semibold text-brand">
          <Highlight text={t.ticketNo} q={q} />
        </span>
        <StatusPill ind={toneToInd[meta?.tone ?? 'neutral']}>{meta?.label ?? t.stage}</StatusPill>
      </div>
      <div className="flex items-center gap-1.5 text-dense font-medium text-ink">
        <User size={13} className="shrink-0 text-ink-3" />
        <span className="truncate">
          <Highlight text={stripCompanySuffix(t.businessName)} q={q} />
        </span>
      </div>
      <div className="truncate text-meta text-ink-2">
        <Highlight text={productLabel(t.productType)} q={q} />
      </div>
      <div className="flex items-center gap-2">
        <StatusPill ind="neutral" variant="fill">
          {t.businessType}
        </StatusPill>
        <span className="flex items-center gap-1 text-meta text-ink-2">
          <Clock size={12} /> <SlaCountdown sla={t.sla} closed={t.stage === Stage.CLOSED} />
        </span>
      </div>
      <button
        onClick={onOpen}
        className="mt-1 inline-flex items-center gap-1 self-start rounded-[10px] border-[0.5px] border-brand bg-brand px-3 py-2 text-xs font-semibold text-white hover:brightness-90"
      >
        Take Action <ArrowRight size={13} />
      </button>
    </div>
  );
}

/** Marks the matched part of a field (brand background, white text). */
function Highlight({ text, q }: { text: string; q: string }): ReactNode {
  const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded-sm bg-brand px-0.5 text-white">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}
