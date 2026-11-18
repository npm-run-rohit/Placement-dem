import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RfqVersion } from './entities/rfq-version.entity';
import { RfqQuery } from './entities/rfq-query.entity';
import { RfqService } from './rfq.service';
import { RfqController } from './rfq.controller';

@Module({
  imports: [TypeOrmModule.forFeature([RfqVersion, RfqQuery])],
  providers: [RfqService],
  controllers: [RfqController],
  exports: [RfqService],
})
export class RfqModule {}
