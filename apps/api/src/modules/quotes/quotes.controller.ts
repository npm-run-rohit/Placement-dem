import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Role } from '@bimaplacement/contracts';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import type { AuthUser } from '../../common/auth/auth.types';
import { QuotesService } from './quotes.service';
import { DecideQuoteDto, SetQuotePremiumDto } from './dto/quotes.dto';

@ApiTags('quotes')
@Roles(Role.PLACEMENT_MANAGER, Role.PLACEMENT_HEAD)
@Controller('tickets/:ticketId/quotes')
export class QuotesController {
  constructor(private readonly quotes: QuotesService) {}

  @Get()
  list(@Param('ticketId', ParseUUIDPipe) ticketId: string) {
    return this.quotes.list(ticketId);
  }

  @Post(':quoteId/decision')
  decide(
    @CurrentUser() u: AuthUser,
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
    @Param('quoteId', ParseUUIDPipe) quoteId: string,
    @Body() dto: DecideQuoteDto,
  ) {
    return this.quotes.decide(u, ticketId, quoteId, dto.decision, dto.note);
  }

  @Put(':quoteId/premium')
  premium(
    @CurrentUser() u: AuthUser,
    @Param('ticketId', ParseUUIDPipe) ticketId: string,
    @Param('quoteId', ParseUUIDPipe) quoteId: string,
    @Body() dto: SetQuotePremiumDto,
  ) {
    return this.quotes.setPremium(u, ticketId, quoteId, dto.premium ?? null);
  }

  // TODO(W6): POST ':threadId/upload' - PM re-upload of a quote received outside the mailbox (creates a new version)
}
