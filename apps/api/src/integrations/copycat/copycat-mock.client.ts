import { createHash } from 'node:crypto';
import type { CopycatClient, CopycatRequestPayload, CopycatResponse } from './copycat.port';

/**
 * Mock mode (FR-178): waits, then returns a placeholder PDF and a comparison table per quote so the quote rows
 * autofill as they will from the live service. DEV FIXTURE values: derived from the quote id, labelled "mock" in
 * the key terms; never real insurer terms.
 */
export class CopycatMockClient implements CopycatClient {
  constructor(private readonly delayMs: number) {}

  async generate(req: CopycatRequestPayload): Promise<CopycatResponse> {
    await new Promise((r) => setTimeout(r, this.delayMs));
    const validity = new Date(Date.now() + 30 * 86_400_000);
    const ddmmyyyy = `${String(validity.getUTCDate()).padStart(2, '0')}/${String(validity.getUTCMonth() + 1).padStart(2, '0')}/${validity.getUTCFullYear()}`;
    const premium = (quoteId: string) => {
      const n = createHash('sha256').update(quoteId).digest().readUInt32BE(0);
      return `₹ ${(100_000 + (n % 900) * 1_000).toLocaleString('en-IN')}`;
    };
    return {
      qcrFile: {
        fileName: `QCR_${req.ticketNo}_V${req.qcrVersion}.pdf`,
        contentType: 'application/pdf',
        bytes: Buffer.from('%PDF-1.4\n% mock QCR\n'),
      },
      comparison: {
        products: [
          {
            product: req.productType,
            columns: req.documents.map((d) => ({ quoteId: d.quoteId, insurer: d.insurer })),
            rows: [
              { term: 'Annual premium (incl. GST)', values: req.documents.map((d) => premium(d.quoteId)) },
              { term: 'Sum insured', values: req.documents.map(() => 'As per RFQ') },
              { term: 'Quote validity', values: req.documents.map(() => ddmmyyyy) },
              { term: 'Key terms', values: req.documents.map(() => 'Mock Copycat comparison (dev)') },
            ],
          },
        ],
      },
      quoteRows: req.documents.map((d) => ({ quoteId: d.quoteId })),
    };
  }
}
