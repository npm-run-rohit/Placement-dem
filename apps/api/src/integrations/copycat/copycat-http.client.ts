import { DomainError } from '../../common/errors/domain-error';
import type { CopycatClient, CopycatRequestPayload, CopycatResponse } from './copycat.port';

/** Live mode. TODO(W7): multipart POST files + metadata; map response; handle job-id + polling if async. */
export class CopycatHttpClient implements CopycatClient {
  constructor(
    private readonly endpoint: string,
    private readonly apiKey: string,
  ) {}

  async generate(_req: CopycatRequestPayload, _timeoutMs: number): Promise<CopycatResponse> {
    if (!this.endpoint || !this.apiKey)
      throw new DomainError('INTEGRATION_FAILED', 'Copycat endpoint/credentials not configured');
    throw DomainError.notImplemented('CopycatHttpClient.generate');
  }
}
