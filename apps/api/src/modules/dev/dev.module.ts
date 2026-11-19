import { Module } from '@nestjs/common';
import { InboundMailModule } from '../inbound-mail/inbound-mail.module';
import { CommunicationsModule } from '../communications/communications.module';
import { RfqModule } from '../rfq/rfq.module';
import { ThreadsModule } from '../threads/threads.module';
import { QuotesModule } from '../quotes/quotes.module';
import { DocumentsModule } from '../documents/documents.module';
import { DevController } from './dev.controller';
import { DevSimulatorService } from './dev-simulator.service';
import { DevJourneyService } from './dev-journey.service';
import { InsurersModule } from '../insurers/insurers.module';
import { MastersModule } from '../masters/masters.module';
import { AutomationModule } from '../automation/automation.module';
import { CopycatModule } from '../../integrations/copycat/copycat.module';

import { DecisionsModule } from '../decisions/decisions.module';
import { QcrModule } from '../qcr/qcr.module';
import { BimaSetuModule } from '../../integrations/bimasetu/bimasetu.module';
import { EmailLayerModule } from '../../integrations/email-layer/email-layer.module';
/** Dev simulators (FEATURE_DEV_SIMULATORS) - replaces the prototype's amber Simulate blocks. */
// AutomationModule: the SLA sweeper runs in-process after an engine-time move (it is only bound to queues in the worker)
@Module({
  imports: [
    RfqModule,
    ThreadsModule,
    QuotesModule,
    DocumentsModule,
    AutomationModule,
    CopycatModule,
    CommunicationsModule,
    InboundMailModule,
    DecisionsModule,
    QcrModule,
    BimaSetuModule,
    EmailLayerModule,
    InsurersModule,
    MastersModule,
  ],
  controllers: [DevController],
  providers: [DevSimulatorService, DevJourneyService],
})
export class DevModule {}
