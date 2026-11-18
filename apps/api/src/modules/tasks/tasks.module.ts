import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PlacementTicket } from '../tickets/entities/placement-ticket.entity';
import { Task } from './task.entity';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

/** PM work items (FR-250 revision tasks); `/me/tasks`. */
@Module({
  imports: [TypeOrmModule.forFeature([Task, PlacementTicket])],
  providers: [TasksService],
  controllers: [TasksController],
  exports: [TypeOrmModule, TasksService],
})
export class TasksModule {}
