import type { AuthenticationMethod, PluginUserModel } from '@attraccess/application-models';
import { Request as BaseRequest } from 'express';

export type { AuthenticationMethod };

/**
 * Extension point of the host application: the core augments it with its own user record. Plugins see only the
 * neutral {@link PluginUserModel} fields.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface, @typescript-eslint/no-empty-object-type
export interface AuthenticatedUserExtensions {}

export interface AuthenticatedUser extends PluginUserModel, AuthenticatedUserExtensions {
  jwtTokenId: string;
  authenticationMethod?: AuthenticationMethod;
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
