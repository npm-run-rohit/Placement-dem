import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SlaConfigService } from './sla-config.service';
import { SlaEvent } from './sla-event.entity';
import { Clock } from '../../common/time/clock';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([SlaEvent])],
  providers: [SlaConfigService, Clock],
  exports: [SlaConfigService, Clock],
})
export class SlaModule {}
