import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Role } from '@bimaplacement/contracts';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import type { AuthUser } from '../../common/auth/auth.types';
import { InsurersService } from './insurers.service';
import { BranchDto, CreateInsurerDto, InsurerFieldsDto } from './dto/insurers.dto';

/** Insurer Contact Master (UI-SPEC 3.5): everyone in Placement reads, only the Placement Head edits (FR-160). */
@ApiTags('insurers')
@Roles(Role.PLACEMENT_MANAGER, Role.PLACEMENT_HEAD, Role.ADMIN)
@Controller()
export class InsurersController {
  constructor(private readonly insurers: InsurersService) {}

  @Get('insurers')
  master(@Query('q') q?: string) {
    return this.insurers.master(q);
  }

  @Get('insurers/master')
  rows(@Query('q') q?: string) {
    return this.insurers.masterRows(q);
  }

  @Get('insurers/change-log')
  changes() {
    return this.insurers.changeLog();
  }

  @Get('tickets/:ticketId/insurer-entities')
  entities(
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
    @Query('includeWithoutPoc') includeWithoutPoc?: string,
  ) {
    return this.insurers.panelForTicket(ticketId, { includeWithoutPoc: includeWithoutPoc === 'true' });
  }

  @Roles(Role.PLACEMENT_HEAD, Role.ADMIN)
  @Post('insurers')
  create(@CurrentUser() u: AuthUser, @Body() dto: CreateInsurerDto) {
    return this.insurers.createInsurer(u, dto);
  }

  @Roles(Role.PLACEMENT_HEAD, Role.ADMIN)
  @Patch('insurers/:id')
  update(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: InsurerFieldsDto) {
    return this.insurers.updateInsurer(u, id, dto);
  }

  @Roles(Role.PLACEMENT_HEAD, Role.ADMIN)
  @Post('insurers/:id/branches')
  addBranch(@CurrentUser() u: AuthUser, @Param('id', ParseUUIDPipe) id: string, @Body() dto: BranchDto) {
    return this.insurers.addBranch(u, id, dto);
  }

  @Roles(Role.PLACEMENT_HEAD, Role.ADMIN)
  @Patch('insurers/:id/branches/:branchId')
  updateBranch(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('branchId', ParseUUIDPipe) branchId: string,
    @Body() dto: BranchDto,
  ) {
    return this.insurers.updateBranch(u, id, branchId, dto);
  }
}
