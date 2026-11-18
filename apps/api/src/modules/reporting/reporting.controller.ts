import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Role, type ProgressView, type ReportsView } from '@bimaplacement/contracts';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import type { AuthUser } from '../../common/auth/auth.types';
import { ReportingService } from './reporting.service';

@ApiTags('reports')
@Roles(Role.PLACEMENT_MANAGER, Role.PLACEMENT_HEAD, Role.ADMIN)
@Controller('reports')
export class ReportingController {
  constructor(private readonly reports: ReportingService) {}

  /** Reports screen (UI-SPEC 3.6): pipeline, SLA, insurer outcomes, funnel. */
  @Get()
  report(@CurrentUser() user: AuthUser): Promise<ReportsView> {
    return this.reports.report(user);
  }

  /** Home "Your Progress": ?scope=me|team&range=week|month|quarter|custom&from=&to= (ISO dates for custom). */
  @Get('progress')
  progress(
    @CurrentUser() user: AuthUser,
    @Query() q: { scope?: string; range?: string; from?: string; to?: string },
  ): Promise<ProgressView> {
    return this.reports.progress(user, q);
  }
}
