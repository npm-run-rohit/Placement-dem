import type { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration';
import type { BimaSetuClient } from './bimasetu.client';
import { BimaSetuOutboundHandler } from './bimasetu-outbound.handler';

describe('BimaSetuOutboundHandler', () => {
  const handler = (mode: 'mock' | 'live') =>
    new BimaSetuOutboundHandler(
      {} as BimaSetuClient,
      { get: () => ({ mode }) } as unknown as ConfigService<AppConfig, true>,
    );

  it('only logs in mock mode', async () => {
    await expect(handler('mock').handle('stage_changed', { ticketNo: 'PLC-1001' })).resolves.toBeUndefined();
  });

  it('fails the job in live mode until the envelope is built, so the message is retried, not lost', async () => {
    await expect(handler('live').handle('stage_changed', { ticketNo: 'PLC-1001' })).rejects.toThrow(
      /not implemented/,
    );
  });
});
