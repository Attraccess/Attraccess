import { AuthenticatedUser } from '@attraccess/plugins-backend-sdk';
import { ForbiddenException } from '@nestjs/common';

/** Full access records have stricter rules than resource metadata or activity. */
export async function assertAccessListAuthority(user: AuthenticatedUser, isIntroducer: () => Promise<boolean>) {
  if (
    !user ||
    (!user.effectivePermissions?.has('resources.update') &&
      !user.effectivePermissions?.has('resources.access.manage') &&
      !(await isIntroducer()))
  ) {
    throw new ForbiddenException('Resource access management permission required');
  }
}
