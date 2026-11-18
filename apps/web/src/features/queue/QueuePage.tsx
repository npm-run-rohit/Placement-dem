import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowDownWideNarrow, Star, X } from 'lucide-react';
import { PRODUCT_TYPES_SEED, STAGE_META, Stage, type TicketListItem } from '@bimaplacement/contracts';
import {
  Avatar,
  ColumnFilter,
  EmptyState,
  FilterPills,
  SortMenu,
  StatusPill,
} from '@/design-system/components';
import { SlaCountdown } from '@/design-system/components/SlaCountdown';
import { toneToInd } from '@/design-system/tokens';
import { PageHead } from '@/shell/PageHead';
import { useMe, useTickets } from '@/api/hooks';
import { stripCompanySuffix } from '@/lib/format';
import { DevSimBlock, DevSimBtn, useDevAction } from '@/dev/DevTools';

type Tab = 'mine' | 'action' | 'sla' | 'all';
type Sort = 'oldest' | 'newest';
type FilterKey = 'stage' | 'type' | 'client' | 'product';

const DESK_LABEL: Record<string, string> = {
  insurerResponse: 'Insurer Response',
  rmResponse: 'RM Response',
  quotesToReview: 'Quotes to Review',
  dueToday: 'Due Today',
  overdue: 'Overdue',
};
const SLA_RISK_MINS = 60; // Threshold Target master: SLA Risk (internal clock, includes breached)
const productLabel = (code: string) => PRODUCT_TYPES_SEED.find((p) => p.code === code)?.label ?? code;
const stageLabel = (s: string) => STAGE_META[s as Stage]?.label ?? s;

/** Tab pools (UI-SPEC 3.2): computed from one fetch of every visible ticket so the counts and rows agree. */
const POOLS: Record<Tab, (t: TicketListItem) => boolean> = {
  mine: (t) => t.stage !== Stage.CLOSED,
  action: (t) => t.stage !== Stage.CLOSED && t.sla.ownerType === 'internal',
  sla: (t) =>
    t.stage !== Stage.CLOSED &&
    t.sla.ownerType === 'internal' &&
    t.sla.remainingMins !== null &&
    t.sla.remainingMins < SLA_RISK_MINS,
  all: () => true,
};

/** "Today" / "1 Day" / "N Days" since received (plFmtAge). */
function ticketAge(receivedAt: string) {
  const days = Math.floor((Date.now() - Date.parse(receivedAt)) / 86_400_000);
  return days <= 0 ? 'Today' : `${days} Day${days === 1 ? '' : 's'}`;
}

const VALUE: Record<FilterKey, (t: TicketListItem) => string> = {
  stage: (t) => t.stage,
  type: (t) => t.businessType,
  client: (t) => stripCompanySuffix(t.businessName),
  product: (t) => t.productType,
};

/**
 * My Tickets / Placement Queue (UI-SPEC 3.2, PLAN 1.4): tab pills with counts, sort by age, header filters
 * (stage / type / client / product), Ticket Age, mandate star, live SLA countdown and, for the Head, Owner.
 */
export function QueuePage() {
  const [tab, setTab] = useState<Tab>('mine');
  const [sort, setSort] = useState<Sort>('oldest');
  const [filters, setFilters] = useState<Record<FilterKey, string[]>>({
    stage: [],
    type: [],
    client: [],
    product: [],
  });
  const [menu, setMenu] = useState<FilterKey | 'sort' | null>(null);
  const nav = useNavigate();
  const { isHead } = useMe();
  const [params, setParams] = useSearchParams();
  const desk = params.get('desk') ?? undefined; // Home desk card deep link (FR-226)
  const scope = params.get('scope') ?? undefined;
  const { data, isLoading } = useTickets({
    tab: 'all',
    sort,
    pageSize: '200',
    ...(desk ? { desk } : {}),
    ...(scope ? { scope } : {}),
  });
  const all = useMemo(() => data?.items ?? [], [data]);

  const pool = useMemo(() => all.filter(POOLS[tab]), [all, tab]);
  const rows = pool.filter((t) =>
    (Object.keys(filters) as FilterKey[]).every(
      (k) => !filters[k].length || filters[k].includes(VALUE[k](t)),
    ),
  );
  const optionsFor = (k: FilterKey) => {
    const values = [...new Set(pool.map(VALUE[k]))];
    return k === 'stage'
      ? values.sort((a, b) => (STAGE_META[a as Stage]?.step ?? 9) - (STAGE_META[b as Stage]?.step ?? 9))
      : values.sort();
  };
  const filter = (k: FilterKey, label: string, render?: (o: string) => string, align?: 'right') => (
    <ColumnFilter
      label={label}
      options={optionsFor(k)}
      selected={filters[k]}
      onChange={(v) => setFilters((f) => ({ ...f, [k]: v }))}
      open={menu === k}
      onOpenChange={(o) => setMenu(o ? k : null)}
      render={render}
      align={align}
    />
  );
  const cols = isHead
    ? 'grid-cols-[110px_160px_96px_86px_minmax(150px,1fr)_minmax(170px,1fr)_130px_120px]'
    : 'grid-cols-[110px_160px_96px_86px_minmax(150px,1fr)_minmax(170px,1fr)_130px]';

  return (
    <div className="px-6 py-6">
      <PageHead
        title="Placement Queue"
        right={
          <FilterPills<Tab>
            value={tab}
            onChange={setTab}
            items={(['mine', 'action', 'sla', 'all'] as const).map((k) => ({
              key: k,
              label: { mine: 'My Tickets', action: 'Action Required', sla: 'SLA Risk', all: 'All Tickets' }[
                k
              ],
              count: data ? all.filter(POOLS[k]).length : undefined,
            }))}
          />
        }
      />
      <FloatSim onOpen={(no) => nav(`/tickets/${no}/rfq`)} />
      <div className="mb-3 flex items-center justify-between gap-3">
        <span>
          {desk && DESK_LABEL[desk] && (
            <button
              onClick={() => setParams({})}
              className="inline-flex items-center gap-1.5 rounded-full border-[0.5px] border-brand-line bg-brand-50 px-3 py-1 text-dense font-medium text-brand"
              title="Clear the desk filter"
            >
              Desk: {DESK_LABEL[desk]}
              {scope === 'me' ? ' · Me' : ''} <X size={13} />
            </button>
          )}
        </span>
        <SortMenu<Sort>
          value={sort}
          onChange={setSort}
          options={[
            { key: 'oldest', label: 'Oldest First' },
            { key: 'newest', label: 'Newest First' },
          ]}
          open={menu === 'sort'}
          onOpenChange={(o) => setMenu(o ? 'sort' : null)}
          icon={<ArrowDownWideNarrow size={14} />}
        />
      </div>
      <div
        className={`grid ${cols} items-center gap-3 rounded-xl bg-canvas px-2 py-3 text-sm font-semibold text-ink`}
      >
        <span>Ticket ID</span>
        {filter('stage', 'Stage', stageLabel)}
        {filter('type', 'Type')}
        <span>Ticket Age</span>
        {filter('client', 'Client')}
        {filter('product', 'Product', productLabel, 'right')}
        <span>Current SLA</span>
        {isHead && <span>Owner</span>}
      </div>
      {isLoading && <div className="p-6 text-dense text-ink-2">Loading…</div>}
      {!isLoading && rows.length === 0 && (
        <div className="mt-4">
          <EmptyState title="No tickets match these filters." />
        </div>
      )}
      {rows.map((t, i) => {
        const meta = STAGE_META[t.stage];
        return (
          <button
            key={t.id}
            onClick={() => nav(`/tickets/${t.ticketNo}`)}
            className={`animate-item grid w-full ${cols} items-center gap-3 rounded-xl border-b border-line-soft px-2 py-3 text-left text-sm font-medium hover:bg-placement-bg`}
            style={{ animationDelay: `${0.1 + Math.min(i, 6) * 0.06}s` }}
          >
            <span className="flex items-center gap-1 text-brand">
              {t.ticketNo}
              {t.mandateState === 'signed' && (
                <Star size={13} className="fill-accent text-accent" aria-label="Exclusive Mandate" />
              )}
              {(t.mandateState === 'requested' || t.mandateState === 'considering') && (
                <Star size={13} className="text-ink-3" aria-label="Mandate requested" />
              )}
            </span>
            <span>
              <StatusPill ind={toneToInd[meta?.tone ?? 'neutral']}>{meta?.label ?? t.stage}</StatusPill>
            </span>
            <span>
              <StatusPill ind="neutral" variant="fill">
                {t.businessType}
              </StatusPill>
            </span>
            <span className="num text-ink">{ticketAge(t.receivedAt)}</span>
            <span className="truncate">{stripCompanySuffix(t.businessName)}</span>
            <span className="truncate">{productLabel(t.productType)}</span>
            <span>
              <SlaCountdown sla={t.sla} closed={t.stage === Stage.CLOSED} />
            </span>
            {isHead && (
              <span className="flex items-center gap-1.5 truncate text-dense font-semibold text-ink-2">
                <Avatar name={t.owner.name} src={t.owner.avatarUrl} size={22} /> {t.owner.name.split(' ')[0]}
              </span>
            )}
          </button>
        );
      })}
      {data && (
        <div className="mt-3 text-meta text-ink-2">
          {rows.length} of {all.length} tickets
        </div>
      )}
    </div>
  );
}

/** Stand-in for an RM floating a line from BimaSetu (prototype PlFloatSimModal). Dev only; runs the real inbound path. */
function FloatSim({ onOpen }: { onOpen: (ticketNo: string) => void }) {
  const float = useDevAction('/dev/bimasetu/float');
  const go = (preset: string) =>
    float.mutate({ preset }, { onSuccess: (r) => onOpen((r as { ticketNo: string }).ticketNo) });
  return (
    <DevSimBlock title="Simulate BimaSetu float">
      <DevSimBtn disabled={float.isPending} onClick={() => go('gmc_new')}>
        GMC · New business
      </DevSimBtn>
      <DevSimBtn disabled={float.isPending} onClick={() => go('fire_renewal')}>
        Fire · Renewal
      </DevSimBtn>
      <DevSimBtn
        disabled={float.isPending}
        title="Rejected: shows the float_rejected reason"
        onClick={() => go('no_rfq')}
      >
        Float without an RFQ
      </DevSimBtn>
    </DevSimBlock>
  );
}
