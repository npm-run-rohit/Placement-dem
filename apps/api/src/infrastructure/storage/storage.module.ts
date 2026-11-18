import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/configuration';
import { LocalStorageAdapter } from './local-storage.adapter';
import { S3StorageAdapter } from './s3-storage.adapter';
import { STORAGE } from './storage.port';

@Global()
@Module({
  providers: [
    {
      provide: STORAGE,
      inject: [ConfigService],
      useFactory: (config: ConfigService<AppConfig, true>) => {
        const s = config.get('storage', { infer: true });
        if (s.driver === 's3')
          return new S3StorageAdapter(
            s.s3Bucket,
            config.get('messaging', { infer: true }).aws.region,
            s.kmsKeyId,
          );
        return new LocalStorageAdapter(
          s.localDir,
          `http://localhost:${config.get('port', { infer: true })}/${config.get('apiPrefix', { infer: true })}`,
        );
      },
    },
  ],
  exports: [STORAGE],
})
export class StorageModule {}
