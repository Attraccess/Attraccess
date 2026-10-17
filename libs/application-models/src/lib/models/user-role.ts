import { User } from './user';
import { Role } from './role';

export enum UserRoleSource {
  MANUAL = 'manual',
  SSO = 'sso',
}

export interface UserRole {
  id: number;
  userId: number;
  roleId: number;
  source: UserRoleSource;
  ssoProviderType: string | null;
  ssoProviderId: number | null;
  externalValue: string | null;
  createdAt: Date;
  updatedAt: Date;
  user: User;
  role: Role;
}
