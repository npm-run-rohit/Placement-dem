import { Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { TaskView } from '@bimaplacement/contracts';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthUser } from '../../common/auth/auth.types';
import { TasksService } from './tasks.service';

@ApiTags('tasks')
@Controller('me/tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  /** ?status=open (default) | all */
  @Get()
  list(@CurrentUser() u: AuthUser, @Query('status') status?: string): Promise<TaskView[]> {
    return this.tasks.mine(u.id, status === 'all' ? 'all' : 'open');
  }

  @Post(':id/done')
  done(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.tasks.complete(u.id, id);
  }
}
