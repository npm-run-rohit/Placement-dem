import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommunicationsModule } from '../communications/communications.module';
import { DocumentsModule } from '../documents/documents.module';
import { RfqModule } from '../rfq/rfq.module';
import { QuotesModule } from '../quotes/quotes.module';
import { ThreadsModule } from '../threads/threads.module';
import { TicketsModule } from '../tickets/tickets.module';
import { InboundMail } from './entities/inbound-mail.entity';
import { InboundMailService } from './inbound-mail.service';
import { ManualReviewController } from './manual-review.controller';
import { MailPollerHandler } from './mail-poller.handler';
import { MAIL_CLASSIFIER, RulesMailClassifier } from './classifier.port';

@Module({
  imports: [
    TypeOrmModule.forFeature([InboundMail]),
    CommunicationsModule,
    DocumentsModule,
    QuotesModule,
    RfqModule,
    ThreadsModule,
    TicketsModule,
  ],
  providers: [
    InboundMailService,
    MailPollerHandler,
    { provide: MAIL_CLASSIFIER, useClass: RulesMailClassifier },
  ],
  controllers: [ManualReviewController],
  exports: [InboundMailService],
})
export class InboundMailModule {}
