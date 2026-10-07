import { Resource } from '@attraccess/database-entities';
import { Logger } from '@nestjs/common';
import { Repository } from 'typeorm';
import { SupervisionService } from '../../../resources/supervision/supervision.service';
import { ResourceUsageService } from '../../../resources/usage/resourceUsage.service';
import { UsersService } from '../../../users-and-auth/users/users.service';
import { AttractapService } from '../../attractap.service';
import { WebsocketService } from '../websocket.service';
import { AuthenticatedWebSocket } from '../websocket.types';

export abstract class AttractapSupervisionHandlerRouteContext {
  protected abstract attractapService: AttractapService;
  protected abstract websocketService: WebsocketService;
  protected abstract resourceUsageService: ResourceUsageService;
  protected abstract readonly logger: Logger;
  protected abstract usersService: UsersService;
  protected abstract resourceRepository: Repository<Resource>;
  protected abstract supervisionService: SupervisionService;
  public abstract cancelForSocket(socket: AuthenticatedWebSocket): void;
  protected abstract getSupervisorNames(supervisorIds: number[]): Promise<string[]>;
}
