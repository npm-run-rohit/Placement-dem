import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Role, type SearchScope, type SearchView } from '@bimaplacement/contracts';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import { Roles } from '../../common/auth/roles.decorator';
import type { AuthUser } from '../../common/auth/auth.types';
import { TicketSearchService } from './ticket-search.service';

const SCOPES: SearchScope[] = ['tickets', 'clients', 'insurers'];

@ApiTags('search')
@Roles(Role.PLACEMENT_MANAGER, Role.PLACEMENT_HEAD)
@Controller('search')
export class SearchController {
  constructor(private readonly searcher: TicketSearchService) {}

  /** Sidebar search modal (UI-SPEC 2.5). `scopes` is a comma list; omitted = all three. */
  @Get()
  search(
    @CurrentUser() user: AuthUser,
    @Query('q') q = '',
    @Query('scopes') scopes?: string,
  ): Promise<SearchView> {
    const picked = scopes === undefined ? SCOPES : SCOPES.filter((s) => scopes.split(',').includes(s));
    return this.searcher.search(user, q.slice(0, 100), picked);
  }
}
