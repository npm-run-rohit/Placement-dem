/**
 * Copycat (external QCR service). OPEN items (PRD App. A #4-8): endpoint/auth, sync vs job+poll,
 * response shape. Default request: multipart quote PDFs + metadata JSON; default response: QCR PDF
 * and/or structured comparison. Credentials stay server-side (10.1).
 */
export interface CopycatRequestPayload {
  requestId: string; // CC-<ticket>-V<qcr>-<attempt>
  ticketNo: string;
  qcrVersion: number;
  rfqVersion: number;
  productType: string;
  rfqTemplate: string;
  earlyReleaseReason?: string | null; // printed on the QCR (FR-107)
  documents: Array<{
    quoteId: string;
    insurer: string;
    branch?: string;
    fileName: string;
    contentType: string;
    bytes: Buffer;
  }>;
}

export interface CopycatResponse {
  qcrFile?: { fileName: string; contentType: string; bytes: Buffer };
  comparison?: {
    products: Array<{
      product: string;
      columns: Array<{ quoteId: string; insurer: string }>;
      rows: Array<{ term: string; values: Array<string | null> }>;
    }>;
  };
  quoteRows?: Array<{
    quoteId: string;
    premium?: number | null;
    sumInsured?: string | null;
    validityDate?: string | null;
    termsNote?: string | null;
  }>;
}

export interface CopycatClient {
  generate(req: CopycatRequestPayload, timeoutMs: number): Promise<CopycatResponse>;
}

export const COPYCAT_CLIENT = Symbol('COPYCAT_CLIENT');
