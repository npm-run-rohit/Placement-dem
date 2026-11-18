import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Role, type RevisionView } from '@bimaplacement/contracts';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import type { AuthUser } from '../../common/auth/auth.types';
import { TicketsService } from '../tickets/tickets.service';
import { DecisionsService } from './decisions.service';
import { CloseNoAppetiteDto, LogClientDecisionDto, NewRfqVersionDto } from './dto/decisions.dto';

@ApiTags('decisions')
@Roles(Role.PLACEMENT_MANAGER, Role.PLACEMENT_HEAD)
@Controller('tickets/:ticketId')
export class DecisionsController {
  constructor(
    private readonly decisions: DecisionsService,
    private readonly tickets: TicketsService,
  ) {}

  /** QCR tab revision card: revision rounds, newest first. */
  @Get('revisions')
  async revisions(
    @CurrentUser() u: AuthUser,
    @Param('ticketId', ParseUUIDPipe) id: string,
  ): Promise<RevisionView[]> {
    await this.tickets.get(u, id); // FR-208 visibility
    return this.decisions.revisions(id);
  }

  @Post('close/no-appetite')
  noAppetite(
    @CurrentUser() u: AuthUser,
    @Param('ticketId', ParseUUIDPipe) id: string,
    @Body() dto: CloseNoAppetiteDto,
  ) {
    return this.decisions.closeNoAppetite(u, id, dto.reason);
  }

  @Post('client-decision')
  clientDecision(
    @CurrentUser() u: AuthUser,
    @Param('ticketId', ParseUUIDPipe) id: string,
    @Body() dto: LogClientDecisionDto,
  ) {
    return this.decisions.logClientDecision(u, id, dto.kind, dto);
  }

  @Post('rfq/versions')
  newRfqVersion(
    @CurrentUser() u: AuthUser,
    @Param('ticketId', ParseUUIDPipe) id: string,
    @Body() dto: NewRfqVersionDto,
  ) {
    return this.decisions.newRfqVersion(u, id, dto);
  }
}
