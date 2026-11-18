import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Role,
  type CurrentUserView,
  type DeskCounts,
  type ManualReviewCounts,
  type Paginated,
  type TicketDetail,
  type TicketListItem,
} from '@bimaplacement/contracts';
import { api } from '@/lib/api-client';

/**
 * Typed react-query hooks over the API read models in @bimaplacement/contracts
 * (TicketListItem / TicketDetail; ThreadView / QuoteView / QcrView as the API grows them).
 * Every mutation invalidates the ticket so status / SLA / next action refresh.
 */

export const qk = {
  tickets: (p: Record<string, unknown>) => ['tickets', p] as const,
  ticket: (id: string) => ['ticket', id] as const,
  sub: (id: string, what: string) => ['ticket', id, what] as const,
};

export const useTickets = (params: {
  tab: string;
  scope?: string;
  sort?: string;
  pageSize?: string;
  desk?: string;
}) =>
  useQuery({
    queryKey: qk.tickets(params),
    queryFn: () =>
      api<Paginated<TicketListItem>>(`/tickets?${new URLSearchParams(params as Record<string, string>)}`),
  });

/** The signed-in user; isHead drives Head-only UI (Owner column, Me / Team, assignment). */
export function useMe() {
  const q = useQuery({ queryKey: ['me'], queryFn: () => api<CurrentUserView>('/me'), staleTime: Infinity });
  const roles = q.data?.roles ?? [];
  return {
    ...q,
    me: q.data,
    isHead: roles.includes(Role.PLACEMENT_HEAD),
    /** Admin masters (PLAN 4.2): Placement Head or Admin. */
    canAdmin: roles.includes(Role.PLACEMENT_HEAD) || roles.includes(Role.ADMIN),
  };
}

export const useDeskCounts = (scope: 'me' | 'team') =>
  useQuery({
    queryKey: ['desk-counts', scope],
    queryFn: () => api<DeskCounts>(`/tickets/desk-counts?scope=${scope}`),
  });

export const useEscalated = (enabled: boolean) =>
  useQuery({ enabled, queryKey: ['escalated'], queryFn: () => api<TicketListItem[]>('/tickets/escalated') });

export const useTicketByNo = (ticketNo: string) =>
  useQuery({
    queryKey: ['ticket-no', ticketNo],
    queryFn: () => api<TicketDetail>(`/tickets/by-no/${ticketNo}`),
  });

export const useTicketSub = <T>(
  id: string | undefined,
  what:
    | 'threads'
    | 'quotes'
    | 'qcrs'
    | 'audit'
    | 'rfq/queries'
    | 'rfq/versions'
    | 'insurer-entities'
    | 'mandate'
    | 'mails'
    | 'bimasetu-messages',
) =>
  useQuery({
    enabled: !!id,
    queryKey: qk.sub(id ?? '', what),
    queryFn: () => api<T>(`/tickets/${id}/${what}`),
  });

export function useTicketCommand<TBody = unknown>(
  id: string,
  method: 'POST' | 'PUT' | 'PATCH',
  path: string,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body?: TBody) => api(`/tickets/${id}${path}`, { method, json: body ?? {} }),
    // a command can change the ticket's stage, status, SLA, desk counts and queue position: refresh everything
    onSuccess: () => qc.invalidateQueries(),
  });
}

export const useInsurers = () =>
  useQuery({
    queryKey: ['insurers'],
    queryFn: () => api<Array<{ id: string; name: string; status: string }>>('/insurers'),
    staleTime: 5 * 60_000,
  });

/** Lookup master values by kind (e.g. mandate_request_reason) from /masters/bootstrap. */
export function useLookup(kind: string) {
  const m = useMasters();
  return ((m.data?.lookups as Array<{ kind: string; value: string; sortOrder?: number }> | undefined) ?? [])
    .filter((l) => l.kind === kind)
    .map((l) => l.value);
}

export const useMasters = () =>
  useQuery({
    queryKey: ['masters'],
    queryFn: () => api<Record<string, unknown>>('/masters/bootstrap'),
    staleTime: 5 * 60_000,
  });

/** Manual Review pending counts (header pills + sidebar dot). */
export const useReviewCounts = () =>
  useQuery({
    queryKey: ['manual-review', 'counts'],
    queryFn: () => api<ManualReviewCounts>('/manual-review/counts'),
    refetchInterval: 60_000,
  });
