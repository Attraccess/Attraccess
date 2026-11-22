import { getSsoAuthenticationDetails } from './getSsoAuthenticationDetails';

/** Whether the user signs in through an identity provider, which then manages the name. */
export function isSsoLinkedUser(user: { authenticationDetails?: unknown } | null | undefined): boolean {
  return getSsoAuthenticationDetails(user).length > 0;
}
