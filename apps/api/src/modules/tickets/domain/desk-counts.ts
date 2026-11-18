import type { DeskCounts, SlaClockView } from '@bimaplacement/contracts';

/** Per-ticket facts the desk cards are derived from (open tickets in scope). */
export interface DeskTicketFacts {
  /** at least one thread on the active RFQ is awaiting the insurer (RFQ sent / acknowledged, no quote or decline yet) */
  waitingOnInsurer: boolean;
  /** RFQ Clarification Required, or a thread held for RM information */
  waitingOnRm: boolean;
  /** at least one live quote awaits the PM's usability decision */
  quotesToReview: boolean;
  sla: SlaClockView;
}

/**
 * Home / Team desk cards (FR-226, FR-271, PRD M12 s12). Ticket counts, not thread counts.
 * Due Today and Overdue look at the active internal clock only; external clocks never count (BR-118).
 */
export function deskCounts(tickets: DeskTicketFacts[], dueSoonBusinessMins: number): DeskCounts {
  const internal = tickets.filter((t) => t.sla.ownerType === 'internal' && t.sla.remainingMins !== null);
  return {
    insurerResponse: tickets.filter((t) => t.waitingOnInsurer).length,
    rmResponse: tickets.filter((t) => t.waitingOnRm).length,
    quotesToReview: tickets.filter((t) => t.quotesToReview).length,
    dueToday: internal.filter((t) => t.sla.remainingMins! >= 0 && t.sla.remainingMins! < dueSoonBusinessMins)
      .length,
    overdue: internal.filter((t) => t.sla.remainingMins! < 0).length,
  };
}
