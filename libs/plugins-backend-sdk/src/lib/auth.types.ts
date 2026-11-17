import type { AuthenticationMethod } from '@attraccess/database-entities';
import { User } from '@attraccess/database-entities';

export type { AuthenticationMethod };
import { Request as BaseRequest } from 'express';

export interface AuthenticatedUser extends User {
  jwtTokenId: string;
  authenticationMethod?: AuthenticationMethod;
  apiTokenId?: number;
  /** API token or MCP grant only: the keys it was granted, before they were intersected with the owner's. */
  permissionScope?: readonly string[];
  /**
   * Effective permissions for this user. Stored as a Set for O(1) has() lookups.
   * Note: A plain Set serializes as {} in JSON — spread to an array before including in any HTTP response.
   * In practice the runtime value is a SerializableSet whose toJSON() emits an array,
   * but callers should not rely on that implementation detail.
   */
  effectivePermissions?: Set<string>;
}

export interface AuthenticatedRequest extends Omit<BaseRequest, 'logout'> {
  user: AuthenticatedUser;
  logout: (callback: () => void) => Promise<void>;
}
