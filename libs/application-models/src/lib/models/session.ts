import { User } from './user';
import { SsoSessionContext } from '../types/sso-session-context';

export interface Session {
  id: number;
  token: string;
  userId: number;
  userAgent: string | null;
  ipAddress: string | null;
  ssoProviderId?: number | null;
  ssoProtocol?: string | null;
  ssoSubject?: string | null;
  ssoSessionId?: string | null;
  ssoContext?: SsoSessionContext | null;
  expiresAt: Date;
  createdAt: Date;
  lastAccessedAt: Date;
  user: User;
}
