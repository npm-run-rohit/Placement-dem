import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Role } from '@bimaplacement/contracts';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import type { AuthUser } from '../../common/auth/auth.types';
import { TicketsService } from './tickets.service';
import { TicketReadService } from './ticket-read.service';
import { CreateManualTicketDto } from './dto/create-ticket.dto';
import { TicketQueryDto } from './dto/ticket-query.dto';
import { CorrectBusinessTypeDto, ReassignDto, SetTargetPremiumDto } from './dto/ticket-commands.dto';

const PLACEMENT = [Role.PLACEMENT_MANAGER, Role.PLACEMENT_HEAD];

@ApiTags('tickets')
@Roles(...PLACEMENT)
@Controller('tickets')
export class TicketsController {
  constructor(
    private readonly tickets: TicketsService,
    private readonly read: TicketReadService,
  ) {}

  /** My Tickets queue (UI-SPEC 3.2): Paginated<TicketListItem>. */
  @Get()
  async list(@CurrentUser() user: AuthUser, @Query() q: TicketQueryDto) {
    const page = await this.tickets.list(user, q);
    return { ...page, items: await this.read.listItems(page.items) };
  }

  /** Home desk counts (FR-226). */
  @Get('desk-counts')
  desk(@CurrentUser() user: AuthUser, @Query('scope') scope: 'me' | 'team' = 'team') {
    return this.read.deskCounts(user, scope === 'me' ? 'me' : 'team');
  }

  /** Home "Escalated to You" (Placement Head): TicketListItem[]. */
  @Get('escalated')
  escalated(@CurrentUser() user: AuthUser) {
    return this.read.escalatedTo(user);
  }

  /** TicketDetail (header + rail). */
  @Get('by-no/:ticketNo')
  async byNo(@CurrentUser() user: AuthUser, @Param('ticketNo') ticketNo: string) {
    return this.read.detail(await this.tickets.getByNo(user, ticketNo));
  }

  /** Breadcrumb TicketPager: previous / next ticket in urgency order. */
  @Get('by-no/:ticketNo/pager')
  async pager(@CurrentUser() user: AuthUser, @Param('ticketNo') ticketNo: string) {
    return this.read.pager(user, await this.tickets.getByNo(user, ticketNo));
  }

  /** Case workspace header + rail: TicketDetail incl. SLA clock view and next action. */
  @Get(':id')
  async get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.read.detail(await this.tickets.get(user, id));
  }

  /** Create Ticket (manual) - FR-192. */
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateManualTicketDto) {
    return this.tickets.createManual(user, dto);
  }

  @Put(':id/target-premium')
  setTargetPremium(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetTargetPremiumDto,
  ) {
    return this.tickets.setTargetPremium(user, id, dto.value ?? null, dto.note);
  }

  @Put(':id/business-type')
  correctBusinessType(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CorrectBusinessTypeDto,
  ) {
    return this.tickets.correctBusinessType(user, id, dto.value, dto.reason);
  }

  @Post(':id/reassign')
  reassign(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: ReassignDto) {
    return this.tickets.reassign(user, id, dto.ownerId, dto.reason);
  }
}
