import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Role } from '@bimaplacement/contracts';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import type { AuthUser } from '../../common/auth/auth.types';
import { SetRiskTierDto } from '../tickets/dto/ticket-commands.dto';
import { RaiseQueriesDto } from './dto/rfq.dto';
import { RfqService } from './rfq.service';

@ApiTags('rfq')
@Roles(Role.PLACEMENT_MANAGER, Role.PLACEMENT_HEAD)
@Controller('tickets/:ticketId/rfq')
export class RfqController {
  constructor(private readonly rfq: RfqService) {}

  @Get('versions')
  versions(@Param('ticketId', ParseUUIDPipe) ticketId: string) {
    return this.rfq.listVersions(ticketId);
  }

  @Get('queries')
  queries(@Param('ticketId', ParseUUIDPipe) ticketId: string) {
    return this.rfq.listQueries(ticketId);
  }

  @Put('risk-tier')
  riskTier(
    @CurrentUser() u: AuthUser,
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
    @Body() dto: SetRiskTierDto,
  ) {
    return this.rfq.setRiskTier(u, ticketId, dto.value);
  }

  @Post('queries')
  raise(
    @CurrentUser() u: AuthUser,
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
    @Body() dto: RaiseQueriesDto,
  ) {
    return this.rfq.raiseQueries(u, ticketId, dto.newQueries, dto.message);
  }

  @Post('queries/:queryId/resolve')
  resolve(
    @CurrentUser() u: AuthUser,
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
    @Param('queryId', ParseUUIDPipe) queryId: string,
  ) {
    return this.rfq.resolveQuery(u, ticketId, queryId);
  }

  @Post('validate')
  validate(@CurrentUser() u: AuthUser, @Param('ticketId', ParseUUIDPipe) ticketId: string) {
    return this.rfq.validate(u, ticketId);
  }
}
