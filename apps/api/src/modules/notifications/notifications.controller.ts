import { Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthUser } from '../../common/auth/auth.types';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@Controller('me/notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() u: AuthUser) {
    return this.notifications.mine(u.id);
  }

  @Get('unread-count')
  unread(@CurrentUser() u: AuthUser) {
    return this.notifications.unreadCount(u.id);
  }

  /** Registered before ':id/read' so 'read-all' is not taken for an id. */
  @Post('read-all')
  readAll(@CurrentUser() u: AuthUser) {
    return this.notifications.markAllRead(u.id);
  }

  @Post(':id/read')
  read(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.notifications.markRead(u.id, id);
  }
}
