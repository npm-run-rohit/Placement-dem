import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Role, type DirectoryView } from '@bimaplacement/contracts';
import { Roles } from '../../common/auth/roles.decorator';
import { UsersService } from './users.service';

@ApiTags('users')
@Roles(Role.PLACEMENT_MANAGER, Role.PLACEMENT_HEAD)
@Controller('directory')
export class DirectoryController {
  constructor(private readonly users: UsersService) {}

  /** Pickers on Create Ticket: RMs (FR-196) and ticket owners for the Head (FR-198). Projected from the Sahayak directory. */
  @Get()
  async directory(): Promise<DirectoryView> {
    const [rms, pms, heads] = await Promise.all([
      this.users.rms(),
      this.users.placementManagers(),
      this.users.heads(),
    ]);
    const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name);
    return {
      rms: rms.map((u) => ({ id: u.id, name: u.name, email: u.email, avatarUrl: u.avatarUrl })).sort(byName),
      owners: [
        ...pms
          .filter((u) => !heads.some((h) => h.id === u.id))
          .map((u) => ({
            id: u.id,
            name: u.name,
            avatarUrl: u.avatarUrl,
            role: 'Placement Manager' as const,
          }))
          .sort(byName),
        ...heads
          .map((u) => ({ id: u.id, name: u.name, avatarUrl: u.avatarUrl, role: 'Placement Head' as const }))
          .sort(byName),
      ],
    };
  }
}
