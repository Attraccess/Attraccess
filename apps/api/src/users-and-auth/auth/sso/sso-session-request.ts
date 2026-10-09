import { Request } from 'express';
import { SsoSessionContext } from '@attraccess/database-entities';

export type SsoSessionRequest = Request & { ssoSessionContext?: SsoSessionContext };
