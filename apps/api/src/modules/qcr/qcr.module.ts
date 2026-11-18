import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QcrVersion } from './entities/qcr-version.entity';
import { QcrRow } from './entities/qcr-row.entity';
import { CopycatRequest } from './entities/copycat-request.entity';
import { QcrService } from './qcr.service';
import { QcrController } from './qcr.controller';

@Module({
  imports: [TypeOrmModule.forFeature([QcrVersion, QcrRow, CopycatRequest])],
  providers: [QcrService],
  controllers: [QcrController],
  exports: [QcrService],
})
export class QcrModule {}
