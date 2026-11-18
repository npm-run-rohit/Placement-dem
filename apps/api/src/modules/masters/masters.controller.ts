import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Role } from '@bimaplacement/contracts';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import type { AuthUser } from '../../common/auth/auth.types';
import { MastersService } from './masters.service';
import type { LookupKind } from './entities';
import {
  HolidayDto,
  HolidayPatchDto,
  LookupDto,
  LookupPatchDto,
  ProductTypePatchDto,
  QuoteTargetDto,
  SlaTargetDto,
  TemplatePatchDto,
} from './dto/admin.dto';

@ApiTags('masters')
@Controller('masters')
export class MastersController {
  constructor(private readonly masters: MastersService) {}

  @Get('bootstrap') bootstrap() {
    return this.masters.bootstrap();
  }
  @Get('product-types') productTypes() {
    return this.masters.productTypes();
  }
  @Get('lookups/:kind') lookups(@Param('kind') kind: LookupKind) {
    return this.masters.lookups(kind);
  }

  @Roles(Role.PLACEMENT_HEAD, Role.ADMIN)
  @Get('templates')
  templates() {
    return this.masters.templates();
  }

  // ---- Admin screens (PLAN 4.2): Placement Head and Admin only; each write returns the refreshed admin view ----

  @Roles(Role.PLACEMENT_HEAD, Role.ADMIN)
  @Get('admin')
  admin() {
    return this.masters.admin();
  }

  @Roles(Role.PLACEMENT_HEAD, Role.ADMIN)
  @Get('change-log')
  changeLog() {
    return this.masters.changeLog();
  }

  @Roles(Role.PLACEMENT_HEAD, Role.ADMIN)
  @Patch('sla/:id')
  sla(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: SlaTargetDto) {
    return this.masters.updateSla(u, id, dto);
  }

  @Roles(Role.PLACEMENT_HEAD, Role.ADMIN)
  @Put('quote-targets')
  quoteTarget(@CurrentUser() u: AuthUser, @Body() dto: QuoteTargetDto) {
    return this.masters.updateQuoteTarget(u, dto);
  }

  @Roles(Role.PLACEMENT_HEAD, Role.ADMIN)
  @Put('settings/:key')
  update(@CurrentUser() u: AuthUser, @Param('key') key: string, @Body() value: unknown) {
    return this.masters.updateSetting(u, key, value);
  }

  @Roles(Role.PLACEMENT_HEAD, Role.ADMIN)
  @Post('holidays')
  addHoliday(@CurrentUser() u: AuthUser, @Body() dto: HolidayDto) {
    return this.masters.addHoliday(u, dto);
  }

  @Roles(Role.PLACEMENT_HEAD, Role.ADMIN)
  @Patch('holidays/:date')
  updateHoliday(@CurrentUser() u: AuthUser, @Param('date') date: string, @Body() dto: HolidayPatchDto) {
    return this.masters.updateHoliday(u, date, dto);
  }

  @Roles(Role.PLACEMENT_HEAD, Role.ADMIN)
  @Post('lookups/:kind')
  addLookup(@CurrentUser() u: AuthUser, @Param('kind') kind: string, @Body() dto: LookupDto) {
    return this.masters.addLookup(u, kind, dto);
  }

  @Roles(Role.PLACEMENT_HEAD, Role.ADMIN)
  @Patch('lookup-values/:id')
  updateLookup(
    @CurrentUser() u: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LookupPatchDto,
  ) {
    return this.masters.updateLookup(u, id, dto);
  }

  @Roles(Role.PLACEMENT_HEAD, Role.ADMIN)
  @Patch('templates/:id')
  updateTemplate(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body() dto: TemplatePatchDto) {
    return this.masters.updateTemplate(u, id, dto);
  }

  @Roles(Role.PLACEMENT_HEAD, Role.ADMIN)
  @Patch('product-types/:code')
  updateProductType(
    @CurrentUser() u: AuthUser,
    @Param('code') code: string,
    @Body() dto: ProductTypePatchDto,
  ) {
    return this.masters.updateProductType(u, code, dto);
  }
}
