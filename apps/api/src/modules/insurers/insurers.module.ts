import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Insurer, InsurerBranch, InsurerPoc, MasterChangeLog } from './entities';
import { InsurersService } from './insurers.service';
import { InsurersController } from './insurers.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Insurer, InsurerBranch, InsurerPoc, MasterChangeLog])],
  providers: [InsurersService],
  controllers: [InsurersController],
  exports: [InsurersService],
})
export class InsurersModule {}
