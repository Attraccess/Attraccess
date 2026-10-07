import { CompanionGatewayService } from './companion-gateway.service';

export abstract class CompanionGatewayRouteContext {
  protected abstract readonly gatewayService: CompanionGatewayService;
}
