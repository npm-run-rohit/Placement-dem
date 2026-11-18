import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AppSetting,
  CommunicationTemplate,
  Holiday,
  LookupValue,
  ProductType,
  QuoteTarget,
  SlaDefinition,
} from './entities';
import { MastersService } from './masters.service';
import { MastersController } from './masters.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ProductType,
      LookupValue,
      SlaDefinition,
      QuoteTarget,
      Holiday,
      AppSetting,
      CommunicationTemplate,
    ]),
  ],
  providers: [MastersService],
  controllers: [MastersController],
  exports: [MastersService],
})
export class MastersModule {}
