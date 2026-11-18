import {
  CopycatStatus,
  InternalStatus,
  QcrSource,
  QuoteDecision,
  SlaId,
  Stage,
  TicketCommand,
  ThreadStatus,
} from '@bimaplacement/contracts';
import { deriveStatus, usableInsurerCount } from './status-deriver';
import { resolveTicketSlaId } from './sla-resolver';
import { nextAction } from './next-action';
import { TicketStateMachine } from './ticket-state-machine';
import type { TicketSnapshot } from './ticket-snapshot';

const base = (over: Partial<TicketSnapshot> = {}): TicketSnapshot => ({
  stage: Stage.RFQ_REVIEW,
  outcomeType: null,
  panelLocked: false,
  activeRfqVersion: 1,
  openRfqQueries: 0,
  threads: [],
  quotes: [],
  draftQcr: null,
  latestReleasedQcr: null,
  openRevision: false,
  channelIsBimaSetu: true,
  ...over,
});

describe('ticket domain', () => {
  it('rfq_review -> Ready for Placement / SLA-02', () => {
    const s = base();
    expect(deriveStatus(s).internal).toBe(InternalStatus.READY_FOR_PLACEMENT);
    expect(resolveTicketSlaId(s)).toBe(SlaId.SLA_02);
  });

  it('market with a thread awaiting RM -> Awaiting RM Information / SLA-03 (external)', () => {
    const s = base({
      stage: Stage.MARKET,
      panelLocked: true,
      threads: [{ id: 't1', insurerId: 'i1', status: ThreadStatus.AWAITING_RM, held: true, rfqVersion: 1 }],
    });
    expect(deriveStatus(s).internal).toBe(InternalStatus.AWAITING_RM_INFORMATION);
    expect(resolveTicketSlaId(s)).toBe(SlaId.SLA_03);
  });

  it('undecided quote -> Quote Review Required / SLA-10 and next action points to quotes', () => {
    const s = base({
      stage: Stage.QUOTE_REVIEW,
      quotes: [{ id: 'q1', insurerId: 'i1', rfqVersion: 1, decision: null }],
    });
    expect(deriveStatus(s).internal).toBe(InternalStatus.QUOTE_REVIEW_REQUIRED);
    expect(resolveTicketSlaId(s)).toBe(SlaId.SLA_10);
    expect(nextAction(s)?.tab).toBe('quotes');
  });

  it('counts usable quotes once per insurer company (BR-115)', () => {
    const s = base({
      quotes: [
        { id: 'q1', insurerId: 'icici', rfqVersion: 1, decision: QuoteDecision.USABLE },
        { id: 'q2', insurerId: 'icici', rfqVersion: 1, decision: QuoteDecision.USABLE },
        { id: 'q3', insurerId: 'hdfc', rfqVersion: 1, decision: QuoteDecision.USABLE },
        { id: 'q4', insurerId: 'tata', rfqVersion: 0, decision: QuoteDecision.USABLE },
      ],
    });
    expect(usableInsurerCount(s)).toBe(2);
  });

  it('copycat generating -> SLA-11, ready -> SLA-12', () => {
    const gen = base({
      stage: Stage.QCR_DRAFT,
      draftQcr: { source: QcrSource.COPYCAT, copycatStatus: CopycatStatus.GENERATING, hasFile: false },
    });
    expect(resolveTicketSlaId(gen)).toBe(SlaId.SLA_11);
    const ready = base({
      stage: Stage.QCR_DRAFT,
      draftQcr: { source: QcrSource.COPYCAT, copycatStatus: CopycatStatus.READY, hasFile: true },
    });
    expect(resolveTicketSlaId(ready)).toBe(SlaId.SLA_12);
    expect(deriveStatus(ready).internal).toBe(InternalStatus.PENDING_PLACEMENT_RELEASE);
  });

  it('blocks invalid transitions and terminal edits', () => {
    expect(() =>
      TicketStateMachine.assertTransition(Stage.RFQ_REVIEW, Stage.QCR_RELEASED, TicketCommand.RELEASE_QCR),
    ).toThrow();
    expect(() => TicketStateMachine.assertMutable(Stage.CLOSED)).toThrow();
    expect(() =>
      TicketStateMachine.assertTransition(
        Stage.RFQ_REVIEW,
        Stage.INSURER_SELECTION,
        TicketCommand.VALIDATE_RFQ,
      ),
    ).not.toThrow();
  });
});
