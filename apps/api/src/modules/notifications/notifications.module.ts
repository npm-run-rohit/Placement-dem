import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from './notification.entity';
import { PlacementTicket } from '../tickets/entities/placement-ticket.entity';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsHandler } from './notifications.handler';

@Module({
  imports: [TypeOrmModule.forFeature([Notification, PlacementTicket])],
  providers: [NotificationsService, NotificationsHandler],
  controllers: [NotificationsController],
  exports: [NotificationsService],
})
export class NotificationsModule {}
