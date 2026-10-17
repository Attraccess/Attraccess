import { User } from './user';
import { AuthenticationType } from '../types/authenticationType.enum';
import { SSOProviderType } from './ssoProvider';

export interface AuthenticationDetail {
  id: number;
  userId: number;
  type: AuthenticationType;
  password?: string;
  providerType?: SSOProviderType | null;
  providerId?: number | null;
  ssoSubject?: string | null;
  totpSecret?: string | null;
  totpEnabledAt?: Date | null;
  user: User;
}
