import { SSOProvider, User } from '@attraccess/react-query-client';

export interface UserPermissionFormProps {
  user: User;
  ssoManagedProviders?: string[];
  ssoManagedPermissionKeys?: Set<string>;
  providersById?: Map<number, SSOProvider>;
  roleIdToAssign?: number;
}
