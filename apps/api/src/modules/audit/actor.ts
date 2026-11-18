import { ActorType } from '@bimaplacement/contracts';
import type { AuthUser } from '../../common/auth/auth.types';
import { isHead } from '../../common/auth/auth.types';

/** Who caused a change. Users act via HTTP; System/BimaSetu/Copycat/Insurer via workers. */
export interface Actor {
  type: ActorType;
  id: string | null;
  name: string;
}

export const Actors = {
  user: (u: AuthUser): Actor => ({ type: isHead(u) ? ActorType.HEAD : ActorType.PM, id: u.id, name: u.name }),
  system: (name = 'System'): Actor => ({ type: ActorType.SYSTEM, id: null, name }),
  bimasetu: (rmName?: string): Actor => ({
    type: ActorType.BIMASETU,
    id: null,
    name: rmName ? `${rmName} (BimaSetu)` : 'BimaSetu',
  }),
  copycat: (): Actor => ({ type: ActorType.COPYCAT, id: null, name: 'Copycat' }),
  insurer: (name: string, email?: string): Actor => ({ type: ActorType.INSURER, id: email ?? null, name }),
  rm: (name: string): Actor => ({ type: ActorType.RM, id: null, name }),
};
