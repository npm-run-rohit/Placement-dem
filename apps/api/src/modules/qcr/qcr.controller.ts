import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Role } from '@bimaplacement/contracts';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import type { AuthUser } from '../../common/auth/auth.types';
import { QcrService } from './qcr.service';
import { EarlyReleaseDto, ReleaseQcrDto, RowsCheckedDto, SetQcrRowDto, UploadQcrDto } from './dto/qcr.dto';

@ApiTags('qcr')
@Roles(Role.PLACEMENT_MANAGER, Role.PLACEMENT_HEAD)
@Controller('tickets/:ticketId/qcrs')
export class QcrController {
  constructor(private readonly qcr: QcrService) {}

  @Get()
  list(@Param('ticketId', ParseUUIDPipe) ticketId: string) {
    return this.qcr.list(ticketId);
  }

  @Get(':qcrId/rows')
  rows(@Param('ticketId', ParseUUIDPipe) id: string, @Param('qcrId', ParseUUIDPipe) qcrId: string) {
    return this.qcr.rowsOf(id, qcrId);
  }

  @Post('early-release')
  early(
    @CurrentUser() u: AuthUser,
    @Param('ticketId', ParseUUIDPipe) id: string,
    @Body() dto: EarlyReleaseDto,
  ) {
    return this.qcr.earlyRelease(u, id, dto.reason);
  }

  @Post('upload')
  upload(
    @CurrentUser() u: AuthUser,
    @Param('ticketId', ParseUUIDPipe) id: string,
    @Body() dto: UploadQcrDto,
  ) {
    return this.qcr.uploadManual(u, id, dto.documentId, dto.earlyReleaseReason);
  }

  @Post('next-version')
  next(@CurrentUser() u: AuthUser, @Param('ticketId', ParseUUIDPipe) id: string) {
    return this.qcr.newVersion(u, id);
  }

  @Post(':qcrId/regenerate')
  regenerate(
    @CurrentUser() u: AuthUser,
    @Param('ticketId', ParseUUIDPipe) id: string,
    @Param('qcrId', ParseUUIDPipe) qcrId: string,
  ) {
    return this.qcr.regenerate(u, id, qcrId);
  }

  @Patch(':qcrId/rows/:quoteId')
  setRow(
    @CurrentUser() u: AuthUser,
    @Param('ticketId', ParseUUIDPipe) id: string,
    @Param('qcrId', ParseUUIDPipe) qcrId: string,
    @Param('quoteId', ParseUUIDPipe) quoteId: string,
    @Body() dto: SetQcrRowDto,
  ) {
    return this.qcr.setRow(u, id, qcrId, quoteId, dto.field, dto.value);
  }

  @Put(':qcrId/rows-checked')
  checked(
    @CurrentUser() u: AuthUser,
    @Param('ticketId', ParseUUIDPipe) id: string,
    @Param('qcrId', ParseUUIDPipe) qcrId: string,
    @Body() dto: RowsCheckedDto,
  ) {
    return this.qcr.setRowsChecked(u, id, qcrId, dto.checked);
  }

  /** Send to BimaSetu (floated) / Send to RM (manual). */
  @Post(':qcrId/release')
  release(
    @CurrentUser() u: AuthUser,
    @Param('ticketId', ParseUUIDPipe) id: string,
    @Param('qcrId', ParseUUIDPipe) qcrId: string,
    @Body() dto: ReleaseQcrDto,
  ) {
    return this.qcr.release(u, id, qcrId, dto.coverNote);
  }
}
