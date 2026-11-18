import { ChevronDown, ChevronUp } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import type { TicketPagerView } from '@bimaplacement/contracts';
import { api } from '@/lib/api-client';

/** Breadcrumb TicketPager (UI-SPEC 2.1): previous / next open ticket in urgency order, keeping the current tab. */
export function TicketPager({ ticketNo, tab }: { ticketNo: string; tab?: string }) {
  const navigate = useNavigate();
  const { data: p } = useQuery({
    queryKey: ['pager', ticketNo],
    queryFn: () => api<TicketPagerView>(`/tickets/by-no/${ticketNo}/pager`),
  });
  const go = (no: string | null) => no && navigate(`/tickets/${no}${tab ? `/${tab}` : ''}`);
  const btn =
    'flex h-[18px] w-[18px] items-center justify-center rounded-md border-[0.5px] border-line bg-white text-ink-2 hover:border-brand hover:text-brand disabled:opacity-40 disabled:hover:border-line disabled:hover:text-ink-2';
  return (
    <div className="flex items-center gap-2">
      <span className="num text-xs font-semibold">
        {p && p.position > 0 ? `${p.position} of ${p.total}` : ticketNo}
      </span>
      <button
        className={btn}
        disabled={!p?.prev}
        onClick={() => go(p?.prev ?? null)}
        title="Previous ticket, in urgency order"
        aria-label="Previous ticket"
      >
        <ChevronUp size={12} />
      </button>
      <button
        className={btn}
        disabled={!p?.next}
        onClick={() => go(p?.next ?? null)}
        title="Next ticket, in urgency order"
        aria-label="Next ticket"
      >
        <ChevronDown size={12} />
      </button>
    </div>
  );
}
