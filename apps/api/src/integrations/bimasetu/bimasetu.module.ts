import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BimaSetuMessage } from './bimasetu-message.entity';
import { RfqModule } from '../../modules/rfq/rfq.module';
import { ThreadsModule } from '../../modules/threads/threads.module';
import { DecisionsModule } from '../../modules/decisions/decisions.module';
import { BimaSetuWebhookController } from './bimasetu-webhook.controller';
import { BimaSetuInboundHandler } from './bimasetu-inbound.handler';
import { BimaSetuOutboundHandler } from './bimasetu-outbound.handler';
import { BimaSetuClient } from './bimasetu.client';
import { BimaSetuReconciliationHandler } from './reconciliation.handler';

import { BimaSetuFloatService } from './bimasetu-float.service';
import { RateLimiter } from '../../common/rate-limit/rate-limiter';
@Module({
  imports: [TypeOrmModule.forFeature([BimaSetuMessage]), RfqModule, ThreadsModule, DecisionsModule],
  providers: [
    BimaSetuClient,
    BimaSetuFloatService,
    BimaSetuInboundHandler,
    BimaSetuOutboundHandler,
    BimaSetuReconciliationHandler,
    RateLimiter,
  ],
  controllers: [BimaSetuWebhookController],
  exports: [BimaSetuClient, BimaSetuFloatService, BimaSetuInboundHandler, TypeOrmModule],
})
export class BimaSetuModule {}
