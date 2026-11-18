import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Mandate } from './entities/mandate.entity';
import { MandateRequest } from './entities/mandate-request.entity';
import { MandatesService } from './mandates.service';
import { MandatesController } from './mandates.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Mandate, MandateRequest])],
  providers: [MandatesService],
  controllers: [MandatesController],
  exports: [MandatesService],
})
export class MandatesModule {}
