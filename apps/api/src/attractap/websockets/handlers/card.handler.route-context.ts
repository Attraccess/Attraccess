import { Logger } from '@nestjs/common';
import { AuditService } from '../../../audit/audit.service';
import { UsersService } from '../../../users-and-auth/users/users.service';
import { AttractapService } from '../../attractap.service';
import { WebsocketService } from '../websocket.service';

export abstract class AttractapCardHandlerRouteContext {
  protected abstract attractapService: AttractapService;
  protected abstract usersService: UsersService;
  protected abstract websocketService: WebsocketService;
  protected abstract readonly logger: Logger;
  protected abstract audit: AuditService;
}
