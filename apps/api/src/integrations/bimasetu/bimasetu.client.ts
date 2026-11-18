import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { BimaSetuEnvelope } from '@bimaplacement/contracts';
import type { AppConfig } from '../../config/configuration';
import { DomainError } from '../../common/errors/domain-error';

/** HTTP client to BimaSetu (mock mode logs). Contract to be agreed with the BimaSetu team (F7/F8). */
@Injectable()
export class BimaSetuClient {
  private readonly logger = new Logger(BimaSetuClient.name);
  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  async send(envelope: BimaSetuEnvelope): Promise<void> {
    const cfg = this.config.get('bimasetu', { infer: true });
    if (cfg.mode === 'mock') {
      this.logger.log(`[mock] -> BimaSetu ${envelope.type} ${envelope.lineRef}`);
      return;
    }
    const res = await fetch(`${cfg.apiUrl}/placement/messages`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${cfg.apiToken}`,
        'idempotency-key': envelope.messageId,
      },
      body: JSON.stringify(envelope),
    });
    if (!res.ok) throw new DomainError('INTEGRATION_FAILED', `BimaSetu ${res.status}`);
  }

  /** Polling fallback if BimaSetu cannot ship webhooks (CTO decision) + nightly reconciliation. */
  async fetchLineState(_lineRef: string): Promise<unknown> {
    throw DomainError.notImplemented('BimaSetuClient.fetchLineState');
  }
}
