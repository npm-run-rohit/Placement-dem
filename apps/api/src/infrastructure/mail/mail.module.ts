import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration';
import { DevMailboxAdapter } from './dev-mailbox.adapter';
import { EmailLayerMailboxAdapter } from './email-layer-mailbox.adapter';
import { GmailMailboxAdapter } from './gmail-mailbox.adapter';
import { MAILBOX } from './mailbox.port';
import { STORAGE, type StoragePort } from '../storage/storage.port';

@Global()
@Module({
  providers: [
    {
      provide: MAILBOX,
      inject: [ConfigService, STORAGE],
      useFactory: (config: ConfigService<AppConfig, true>, storage: StoragePort) => {
        switch (config.get('mailbox', { infer: true }).driver) {
          case 'email-layer':
            return new EmailLayerMailboxAdapter(config.get('mailbox', { infer: true }).emailLayer, storage);
          case 'gmail':
            return new GmailMailboxAdapter();
          case 'graph': // TODO(W5): MicrosoftGraphMailboxAdapter
          case 'dev':
          default:
            return new DevMailboxAdapter(config.get('mailbox', { infer: true }), storage);
        }
      },
    },
  ],
  exports: [MAILBOX],
})
export class MailModule {}
