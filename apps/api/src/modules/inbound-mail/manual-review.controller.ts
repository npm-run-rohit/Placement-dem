import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { IsEnum, IsUUID } from 'class-validator';
import { InboundClass, Role } from '@bimaplacement/contracts';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import type { AuthUser } from '../../common/auth/auth.types';
import { InboundMailService } from './inbound-mail.service';

class ConfirmClassificationDto {
  @IsEnum(InboundClass)
  label: InboundClass;
}

class ConfirmMappingDto {
  @IsUUID()
  ticketId: string;

  @IsUUID()
  threadId: string;
}

/** Manual Review (UI-SPEC 3.4, FR-227..229). */
@ApiTags('manual-review')
@Roles(Role.PLACEMENT_MANAGER, Role.PLACEMENT_HEAD)
@Controller('manual-review')
export class ManualReviewController {
  constructor(private readonly inbound: InboundMailService) {}

  @Get()
  list(@CurrentUser() u: AuthUser, @Query('queue') queue: 'my_reviews' | 'unmatched' = 'my_reviews') {
    return this.inbound.queue(u, queue === 'unmatched' ? 'unmatched' : 'my_reviews');
  }

  @Get('counts')
  counts(@CurrentUser() u: AuthUser) {
    return this.inbound.counts(u);
  }

  @Get(':mailId/ticket-options')
  ticketOptions(@CurrentUser() u: AuthUser, @Param('mailId', ParseUUIDPipe) id: string) {
    return this.inbound.ticketOptions(u, id);
  }

  @Post(':mailId/classification')
  classify(
    @CurrentUser() u: AuthUser,
    @Param('mailId', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmClassificationDto,
  ) {
    return this.inbound.confirmClassification(u, id, dto.label);
  }

  @Post(':mailId/handled')
  handled(@CurrentUser() u: AuthUser, @Param('mailId', ParseUUIDPipe) id: string) {
    return this.inbound.markHandled(u, id);
  }

  @Post(':mailId/mapping')
  map(
    @CurrentUser() u: AuthUser,
    @Param('mailId', ParseUUIDPipe) id: string,
    @Body() dto: ConfirmMappingDto,
  ) {
    return this.inbound.confirmMapping(u, id, dto.ticketId, dto.threadId);
  }
}
