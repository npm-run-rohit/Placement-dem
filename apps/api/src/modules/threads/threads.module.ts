import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { InsurersModule } from '../insurers/insurers.module';
import { InsurerThread } from './entities/insurer-thread.entity';
import { PanelSelection } from './entities/panel-selection.entity';
import { ThreadEvent } from './entities/thread-event.entity';
import { ThreadClarification } from './entities/thread-clarification.entity';
import { CallLog } from './entities/call-log.entity';
import { ThreadsService } from './threads.service';
import { ThreadsController } from './threads.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([InsurerThread, PanelSelection, ThreadEvent, ThreadClarification, CallLog]),
    InsurersModule,
  ],
  providers: [ThreadsService],
  controllers: [ThreadsController],
  exports: [ThreadsService],
})
export class ThreadsModule {}
