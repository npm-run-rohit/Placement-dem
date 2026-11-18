import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration';
import { DocumentsModule } from '../../modules/documents/documents.module';
import { QcrModule } from '../../modules/qcr/qcr.module';
import { COPYCAT_CLIENT } from './copycat.port';
import { CopycatMockClient } from './copycat-mock.client';
import { CopycatHttpClient } from './copycat-http.client';
import { CopycatRunnerHandler } from './copycat-runner.handler';

@Module({
  imports: [QcrModule, DocumentsModule],
  providers: [
    {
      provide: COPYCAT_CLIENT,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => {
        const c = config.get('copycat', { infer: true });
        return c.mode === 'live'
          ? new CopycatHttpClient(c.endpoint, c.apiKey)
          : new CopycatMockClient(c.mockDelayMs);
      },
    },
    CopycatRunnerHandler,
  ],
  exports: [CopycatRunnerHandler],
})
export class CopycatModule {}
