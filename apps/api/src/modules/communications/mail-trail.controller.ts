import { Controller, Get, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Role } from '@bimaplacement/contracts';
import { Roles } from '../../common/auth/roles.decorator';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthUser } from '../../common/auth/auth.types';
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

  /** A failed outbound mail is sent again as a new mail event (same content and conversation); owner or Head. */
  @Post('mails/:mailId/resend')
  resend(
    @CurrentUser() user: AuthUser,
    @Param('ticketId', ParseUUIDPipe) id: string,
    @Param('mailId', ParseUUIDPipe) mailId: string,
  ) {
    return this.trail.resend(user, id, mailId);
  }

  @Get('bimasetu-messages')
  bimasetu(@Param('ticketId', ParseUUIDPipe) id: string) {
    return this.trail.bimasetu(id);
  }
}
