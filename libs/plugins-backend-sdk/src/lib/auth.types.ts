import { User } from '@attraccess/database-entities';
import { Request as BaseRequest } from 'express';

export interface AuthenticatedUser extends User {
  jwtTokenId: string;
  effectivePermissions?: Set<string>;
}

export interface AuthenticatedRequest extends Omit<BaseRequest, 'logout'> {
  user: AuthenticatedUser;
  logout: (callback: () => void) => Promise<void>;
}
