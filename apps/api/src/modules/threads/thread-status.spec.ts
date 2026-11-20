import { QuoteDecision, ThreadStatus } from '@bimaplacement/contracts';
import { hasOpenQuestion, statusAfterReply, statusForQuote } from './thread-status';

describe('thread status helpers', () => {
  it('treats an unanswered insurer question and a hold for the RM as open', () => {
    expect(hasOpenQuestion(ThreadStatus.INSURER_CLARIFICATION)).toBe(true);
    expect(hasOpenQuestion(ThreadStatus.AWAITING_RM)).toBe(true);
    expect(hasOpenQuestion(ThreadStatus.QUOTE_RECEIVED)).toBe(false);
    expect(hasOpenQuestion(ThreadStatus.ACKNOWLEDGED)).toBe(false);
  });

  describe('statusAfterReply', () => {
    const q = (version: number, decision: QuoteDecision | null) => ({ version, decision });
    it('goes back to Acknowledged when no quote came in', () => {
      expect(statusAfterReply([])).toBe(ThreadStatus.ACKNOWLEDGED);
    });
    it('shows a quote that is still waiting for review', () => {
      expect(statusAfterReply([q(1, QuoteDecision.USABLE), q(2, null)])).toBe(ThreadStatus.QUOTE_RECEIVED);
    });
    it('keeps a quote clarification open', () => {
      expect(statusAfterReply([q(1, QuoteDecision.CLARIFICATION)])).toBe(ThreadStatus.QUOTE_CLARIFICATION);
    });
    it('keeps a usable quote even when a later version was excluded', () => {
      expect(statusAfterReply([q(1, QuoteDecision.USABLE), q(2, QuoteDecision.EXCLUDED)])).toBe(
        ThreadStatus.QUOTE_USABLE,
      );
    });
    it('keeps chasing the insurer when the only quote was excluded', () => {
      expect(statusAfterReply([q(1, QuoteDecision.EXCLUDED)])).toBe(ThreadStatus.ACKNOWLEDGED);
    });
    it('ignores superseded versions', () => {
      expect(statusAfterReply([q(1, QuoteDecision.SUPERSEDED)])).toBe(ThreadStatus.ACKNOWLEDGED);
    });
  });

  it('maps a quote decision to the thread status', () => {
    expect(statusForQuote(null)).toBe(ThreadStatus.QUOTE_RECEIVED);
    expect(statusForQuote(QuoteDecision.USABLE)).toBe(ThreadStatus.QUOTE_USABLE);
    expect(statusForQuote(QuoteDecision.CLARIFICATION)).toBe(ThreadStatus.QUOTE_CLARIFICATION);
    expect(statusForQuote(QuoteDecision.EXCLUDED)).toBe(ThreadStatus.QUOTE_EXCLUDED);
  });
});
