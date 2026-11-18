import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AuditService } from './audit.service';

@ApiTags('audit')
@Controller('tickets/:ticketId/audit')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  list(@Param('ticketId', ParseUUIDPipe) ticketId: string, @Query('actorType') actorType?: string) {
    return this.audit.forTicket(ticketId, actorType ? actorType.split(',') : undefined);
  }
}
