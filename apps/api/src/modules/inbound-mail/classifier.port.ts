import { InboundClass } from '@bimaplacement/contracts';

/**
 * Inbound insurer mail classifier (FR-074). V1 can start rules-based (keywords + attachment type)
 * and move to an LLM (Bedrock / Anthropic API - CTO decision) behind this port. Low confidence
 * -> Manual Review (FR-073). Human corrections are stored as feedback (FR-078).
 */
export interface MailClassifier {
  classify(input: {
    subject: string;
    body: string;
    attachmentNames: string[];
  }): Promise<{ label: InboundClass; confidence: number; rationale?: string }>;
}

export const MAIL_CLASSIFIER = Symbol('MAIL_CLASSIFIER');

/** Naive rules baseline so the pipeline runs end-to-end in dev. */
export class RulesMailClassifier implements MailClassifier {
  async classify(input: { subject: string; body: string; attachmentNames: string[] }) {
    const text = `${input.subject}\n${input.body}`.toLowerCase();
    // strong signals: an explicit decline phrase, or a quote-named PDF attached
    if (/regret|unable to quote|not in (our )?appetite|no appetite/.test(text))
      return { label: InboundClass.DECLINED, confidence: 0.9 };
    if (/declin/.test(text)) return { label: InboundClass.DECLINED, confidence: 0.7 };
    if (input.attachmentNames.some((n) => /(quote|quotation).*\.pdf$/i.test(n)))
      return { label: InboundClass.QUOTE_RECEIVED, confidence: 0.9 };
    if (
      input.attachmentNames.some((n) => /quote|quotation|terms/i.test(n)) ||
      /please find (our|the) quot/.test(text)
    )
      return { label: InboundClass.QUOTE_RECEIVED, confidence: 0.75 };
    if (/\?|clarif|please (share|provide|confirm)/.test(text))
      return { label: InboundClass.CLARIFICATION_REQUIRED, confidence: 0.6 };
    if (/acknowledg|under review|noted/.test(text))
      return { label: InboundClass.ACKNOWLEDGED, confidence: 0.6 };
    return { label: InboundClass.NOT_APPLICABLE, confidence: 0.3 };
  }
}
