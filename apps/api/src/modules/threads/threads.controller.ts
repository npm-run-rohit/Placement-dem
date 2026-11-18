import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Role } from '@bimaplacement/contracts';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import type { AuthUser } from '../../common/auth/auth.types';
import { ThreadsService } from './threads.service';
import {
  HoldForRmDto,
  LogCallDto,
  ReplyToInsurerDto,
  RestartThreadsDto,
  TogglePanelEntityDto,
} from './dto/threads.dto';

@ApiTags('threads')
@Roles(Role.PLACEMENT_MANAGER, Role.PLACEMENT_HEAD)
@Controller('tickets/:ticketId')
export class ThreadsController {
  constructor(private readonly threads: ThreadsService) {}

  @Put('panel')
  toggle(
    @CurrentUser() u: AuthUser,
    @Param('ticketId', ParseUUIDPipe) id: string,
    @Body() dto: TogglePanelEntityDto,
  ) {
    return this.threads.togglePanelEntity(u, id, dto.insurerId, dto.branchId, dto.selected);
  }

  @Post('rfq/float')
  float(@CurrentUser() u: AuthUser, @Param('ticketId', ParseUUIDPipe) id: string) {
    return this.threads.floatRfq(u, id);
  }

  @Get('threads')
  list(@Param('ticketId', ParseUUIDPipe) id: string) {
    return this.threads.list(id);
  }

  @Get('threads/:threadId/timeline')
  timeline(
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
    @Param('threadId', ParseUUIDPipe) threadId: string,
  ) {
    return this.threads.timeline(ticketId, threadId);
  }

  @Post('threads/:threadId/hold-for-rm')
  hold(
    @CurrentUser() u: AuthUser,
    @Param('ticketId', ParseUUIDPipe) id: string,
    @Param('threadId', ParseUUIDPipe) tid: string,
    @Body() dto: HoldForRmDto,
  ) {
    return this.threads.holdForRm(u, id, tid, dto.request);
  }

  @Post('threads/:threadId/reply')
  reply(
    @CurrentUser() u: AuthUser,
    @Param('ticketId', ParseUUIDPipe) id: string,
    @Param('threadId', ParseUUIDPipe) tid: string,
    @Body() dto: ReplyToInsurerDto,
  ) {
    return this.threads.replyToInsurer(u, id, tid, dto.text);
  }

  @Post('threads/:threadId/follow-up')
  followUp(
    @CurrentUser() u: AuthUser,
    @Param('ticketId', ParseUUIDPipe) id: string,
    @Param('threadId', ParseUUIDPipe) tid: string,
  ) {
    return this.threads.followUp(u, id, tid);
  }

  @Post('threads/:threadId/calls')
  logCall(
    @CurrentUser() u: AuthUser,
    @Param('ticketId', ParseUUIDPipe) id: string,
    @Param('threadId', ParseUUIDPipe) tid: string,
    @Body() dto: LogCallDto,
  ) {
    return this.threads.logCall(u, id, tid, dto);
  }

  @Post('threads/restart')
  restart(
    @CurrentUser() u: AuthUser,
    @Param('ticketId', ParseUUIDPipe) id: string,
    @Body() dto: RestartThreadsDto,
  ) {
    return this.threads.restartThreads(u, id, dto.threadIds, dto.reason);
  }
}
