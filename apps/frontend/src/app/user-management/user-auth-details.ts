import { User } from '@attraccess/react-query-client';
export type AuthenticationDetailSummary = {
  providerId?: number | null;
  providerType?: string | null;
  ssoSubject?: string | null;
  type?: string | null;
};

export type UserWithAuthDetails = Omit<User, 'authenticationDetails'> & {
  authenticationDetails?: AuthenticationDetailSummary[];
};
