import type { AttractapCardOwner } from '@attraccess/application-models';
import type { UsersService } from '../users-and-auth/users/users.service';

/** The user as the user service knows it. */
export type CoreUser = NonNullable<Awaited<ReturnType<UsersService['findOne']>>>;

/**
 * A card owner as the services of other modules expect a user. The card store reads the owner as the user row
 * without its relations, so this is the same data under the type those services declare. It goes away when those
 * services speak a neutral user model.
 */
export function asCoreUser(owner: AttractapCardOwner): CoreUser {
  return owner as unknown as CoreUser;
}
