import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MailMessage } from './entities/mail-message.entity';
import { MailOutboundHandler } from './mail-outbound.handler';
import { MailTrailController } from './mail-trail.controller';
import { MailTrailService } from './mail-trail.service';

@Module({
  imports: [TypeOrmModule.forFeature([MailMessage])],
  controllers: [MailTrailController],
  providers: [MailOutboundHandler, MailTrailService],
  exports: [TypeOrmModule, MailOutboundHandler, MailTrailService],
})
export class CommunicationsModule {}
