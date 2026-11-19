import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BimaSetuModule } from '../bimasetu/bimasetu.module';
import { InboundMailModule } from '../../modules/inbound-mail/inbound-mail.module';
import { PlacementTicket } from '../../modules/tickets/entities/placement-ticket.entity';
import { EmailLayerDelivery } from './email-layer-delivery.entity';
import { EmailLayerInboundService } from './email-layer-inbound.service';
import { EmailLayerWebhookController } from './email-layer-webhook.controller';

/** RateLimiter is the single instance exported by BimaSetuModule (one per-IP bucket store for both webhooks). */
@Module({
  imports: [
    TypeOrmModule.forFeature([EmailLayerDelivery, PlacementTicket]),
    InboundMailModule,
    BimaSetuModule,
  ],
  // the controller is also a provider so the dev simulator can post through the very same handler (signature included)
  providers: [EmailLayerInboundService, EmailLayerWebhookController],
  exports: [EmailLayerWebhookController],
  controllers: [EmailLayerWebhookController],
})
export class EmailLayerModule {}
