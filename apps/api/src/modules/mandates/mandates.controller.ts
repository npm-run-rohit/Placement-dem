import { Body, Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Role } from '@bimaplacement/contracts';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import type { AuthUser } from '../../common/auth/auth.types';
import { MandatesService } from './mandates.service';
import { IncumbentMandateDto, MandateResponseDto, NoteDto, RequestMandateDto } from './dto/mandates.dto';

@ApiTags('mandates')
@Roles(Role.PLACEMENT_MANAGER, Role.PLACEMENT_HEAD)
@Controller('tickets/:ticketId/mandate')
export class MandatesController {
  constructor(private readonly mandates: MandatesService) {}

  @Get()
  get(@Param('ticketId', ParseUUIDPipe) id: string) {
    return this.mandates.forTicket(id);
  }

  @Post('requests')
  request(
    @CurrentUser() u: AuthUser,
    @Param('ticketId', ParseUUIDPipe) id: string,
    @Body() dto: RequestMandateDto,
  ) {
    return this.mandates.request(u, id, dto);
  }

  @Post('requests/remind')
  remind(@CurrentUser() u: AuthUser, @Param('ticketId', ParseUUIDPipe) id: string, @Body() dto: NoteDto) {
    return this.mandates.remind(u, id, dto.note);
  }

  @Post('requests/withdraw')
  withdraw(@CurrentUser() u: AuthUser, @Param('ticketId', ParseUUIDPipe) id: string, @Body() dto: NoteDto) {
    return this.mandates.withdraw(u, id, dto.note);
  }

  @Post('requests/response')
  respond(
    @CurrentUser() u: AuthUser,
    @Param('ticketId', ParseUUIDPipe) id: string,
    @Body() dto: MandateResponseDto,
  ) {
    return this.mandates.recordResponse(u, id, dto);
  }

  /** Incumbent Approach Mandate (BR-026): proof uploaded first via POST /documents (kind=mandate_proof). */
  @Post('incumbent')
  incumbent(
    @CurrentUser() u: AuthUser,
    @Param('ticketId', ParseUUIDPipe) id: string,
    @Body() dto: IncumbentMandateDto,
  ) {
    return this.mandates.recordIncumbentMandate(u, id, dto.proofDocumentId, dto.reference);
  }
}
