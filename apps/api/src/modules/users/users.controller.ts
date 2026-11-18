import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { CurrentUserView } from '@bimaplacement/contracts';
import { CurrentUser } from '../../common/auth/current-user.decorator';
import type { AuthUser } from '../../common/auth/auth.types';
import { UsersService } from './users.service';

@ApiTags('users')
@Controller('me')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /** The signed-in user (from the Sahayak token / dev header) for role-aware UI: Owner column, Me / Team, Head-only actions. */
  @Get()
  async me(@CurrentUser() user: AuthUser): Promise<CurrentUserView> {
    const u = await this.users.get(user.id);
    return { id: u.id, name: u.name, email: u.email, roles: user.roles, avatarUrl: u.avatarUrl };
  }
}
