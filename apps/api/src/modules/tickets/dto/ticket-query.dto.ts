import { IsIn, IsOptional, IsString } from 'class-validator';
import type { DeskCounts } from '@bimaplacement/contracts';
import { PaginationQuery } from '../../../common/pagination/pagination.dto';

/** My Tickets queue (UI-SPEC 3.2): tabs mine | action | sla | all; Head scope me | team. */
export class TicketQueryDto extends PaginationQuery {
  @IsOptional()
  @IsIn(['mine', 'action', 'sla', 'all'])
  tab: 'mine' | 'action' | 'sla' | 'all' = 'mine';

  @IsOptional()
  @IsIn(['me', 'team'])
  scope?: 'me' | 'team';

  @IsOptional() @IsString() stage?: string; // comma-separated
  @IsOptional() @IsString() businessType?: string;
  @IsOptional() @IsString() productType?: string;
  @IsOptional() @IsString() urgency?: string;
  @IsOptional() @IsString() q?: string;

  /** Home desk card deep link (FR-226): same rules as GET /tickets/desk-counts. */
  @IsOptional()
  @IsIn(['insurerResponse', 'rmResponse', 'quotesToReview', 'dueToday', 'overdue'])
  desk?: keyof DeskCounts;
  @IsOptional()
  @IsIn(['oldest', 'newest'])
  sort: 'oldest' | 'newest' = 'oldest';
}
