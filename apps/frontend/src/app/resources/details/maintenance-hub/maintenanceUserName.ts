import { formatUserDisplayName } from '@attraccess/shared';

type MaintenanceUser = { username?: string; firstName?: string | null; lastName?: string | null };

/** The display name of the user a maintenance entry points at, or undefined when it has none. */
export function maintenanceUserName(user: unknown): string | undefined {
  const { username, firstName, lastName } = (user ?? {}) as MaintenanceUser;
  return username ? formatUserDisplayName({ username, firstName, lastName }) : undefined;
}
