import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentKind } from '@bimaplacement/contracts';
import type { AppConfig } from '../../config/configuration';
import { QueueHandler } from '../../infrastructure/messaging/queue-handler.decorator';
import { QUEUES } from '../../infrastructure/messaging/queues';
import type { JobHandler } from '../../infrastructure/messaging/messaging.ports';
import { DocumentsService } from '../../modules/documents/documents.service';
import { QcrService } from '../../modules/qcr/qcr.service';
import { COPYCAT_CLIENT, type CopycatClient } from './copycat.port';

/**
 * The single Copycat runner (FR-239): concurrency 1 per request id (jobId = outbox id), network call
 * outside any DB transaction, result applied through QcrService.copycatResult which ignores
 * superseded request ids (FR-240). Loads the quote PDFs from storage, stores the returned QCR as a
 * Document(kind=qcr) and merges the returned quote rows (FR-178, FR-286).
 */
@Injectable()
@QueueHandler(QUEUES.COPYCAT, { concurrency: 2 })
export class CopycatRunnerHandler implements JobHandler {
  private readonly logger = new Logger(CopycatRunnerHandler.name);

  constructor(
    @Inject(COPYCAT_CLIENT) private readonly client: CopycatClient,
    private readonly qcr: QcrService,
    private readonly documents: DocumentsService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  async handle(_jobName: string, data: { requestId: string }): Promise<void> {
    const job = await this.qcr.copycatJob(data.requestId);
    if (!job) return; // superseded or already released - nothing to do (idempotent)
    await this.qcr.markCopycatStarted(data.requestId);
    try {
      const documents = await Promise.all(
        job.request.documents.map(async (d) => ({
          quoteId: d.quoteId,
          insurer: d.insurer,
          ...(await this.documents.readBuffer(d.documentId)),
        })),
      );
      const res = await this.client.generate(
        {
          requestId: data.requestId,
          ticketNo: job.ticket.ticketNo,
          qcrVersion: job.qcr.version,
          rfqVersion: job.qcr.rfqVersion,
          productType: job.ticket.productType,
          rfqTemplate: job.rfqTemplate,
          earlyReleaseReason: job.qcr.earlyReleaseReason,
          documents,
        },
        this.config.get('copycat', { infer: true }).timeoutMs,
      );
      if (!res.qcrFile) throw new Error('Copycat returned no QCR file');
      const doc = await this.documents.upload({
        ticketId: job.ticket.id,
        kind: DocumentKind.QCR,
        fileName: res.qcrFile.fileName,
        contentType: res.qcrFile.contentType,
        buffer: res.qcrFile.bytes,
        uploadedBy: 'copycat',
      });
      await this.qcr.copycatResult(data.requestId, {
        ok: true,
        documentId: doc.id,
        comparison: res.comparison,
        rows: res.quoteRows,
      });
    } catch (e) {
      this.logger.warn(`Copycat ${data.requestId} failed: ${(e as Error).message}`);
      await this.qcr.copycatResult(data.requestId, { ok: false, error: (e as Error).message });
    }
  }
}
