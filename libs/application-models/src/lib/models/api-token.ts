import { User } from './user';
import { ApiTokenPermission } from './api-token-permission';

export interface ApiToken {
  id: number;
  userId: number;
  name: string;
  tokenHash: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  expiresAt: Date | null;
  revokedAt: Date | null;
  user: User;
  apiTokenPermissions: ApiTokenPermission[];
  readonly permissionKeys: string[];
}
