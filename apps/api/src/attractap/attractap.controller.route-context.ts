import { CardAccessService } from './card-access.service';
import { AttractapService } from './attractap.service';
import { AttractapGateway } from './websockets/websocket.gateway';

export abstract class AttractapControllerRouteContext {
  protected abstract readonly cardAccess: CardAccessService;
  protected abstract readonly attractapGateway: AttractapGateway;
  protected abstract readonly attractapService: AttractapService;
}
