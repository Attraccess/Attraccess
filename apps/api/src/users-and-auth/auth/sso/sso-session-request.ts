import { Request } from 'express';
import { SsoSessionContext } from '@attraccess/application-models';

export type SsoSessionRequest = Request & { ssoSessionContext?: SsoSessionContext };
