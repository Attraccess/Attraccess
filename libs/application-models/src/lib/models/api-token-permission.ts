import { ApiToken } from './api-token';
import { Permission } from './permission';

export interface ApiTokenPermission {
  id: number;
  apiTokenId: number;
  permissionKey: string;
  createdAt: Date;
  apiToken: ApiToken;
  permission: Permission;
}
