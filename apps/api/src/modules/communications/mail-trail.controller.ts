import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Role } from '@bimaplacement/contracts';
import { Roles } from '../../common/auth/roles.decorator';
import { MailTrailService } from './mail-trail.service';

@ApiTags('mail-trail')
@Roles(Role.PLACEMENT_MANAGER, Role.PLACEMENT_HEAD)
@Controller('tickets/:ticketId')
export class MailTrailController {
  constructor(private readonly trail: MailTrailService) {}

  @Get('mails')
  mails(@Param('ticketId', ParseUUIDPipe) id: string) {
    return this.trail.mails(id);
  }

  @Get('bimasetu-messages')
  bimasetu(@Param('ticketId', ParseUUIDPipe) id: string) {
    return this.trail.bimasetu(id);
  }
}
