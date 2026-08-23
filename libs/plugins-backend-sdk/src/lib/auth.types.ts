import { User } from '@attraccess/database-entities';
import { Request as BaseRequest } from 'express';

export interface AuthenticatedUser extends User {
  jwtTokenId: string;
  authenticationMethod?: 'session' | 'api-token';
  apiTokenId?: number;
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
