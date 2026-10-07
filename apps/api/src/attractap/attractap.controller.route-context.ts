import { AttractapService } from './attractap.service';
import { AttractapGateway } from './websockets/websocket.gateway';

export abstract class AttractapControllerRouteContext {
  protected abstract readonly attractapGateway: AttractapGateway;
  protected abstract readonly attractapService: AttractapService;
}
