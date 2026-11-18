import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Revision } from './entities/revision.entity';
import { DecisionsService } from './decisions.service';
import { DecisionsController } from './decisions.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Revision])],
  providers: [DecisionsService],
  controllers: [DecisionsController],
  exports: [DecisionsService],
})
export class DecisionsModule {}
