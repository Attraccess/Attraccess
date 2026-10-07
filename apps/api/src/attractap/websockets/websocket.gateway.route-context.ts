import { Logger } from '@nestjs/common';
import { Mutex } from 'async-mutex';
import { LicenseService } from '../../license/license.service';
import { WsMetrics } from '../../metrics/definitions/ws.metrics';
import { MetricsService } from '../../metrics/metrics.service';
import { MetricsToggleService } from '../../metrics/settings/metrics-toggle.service';
import { AttractapService } from '../attractap.service';
import { AttractapCardHandler } from './handlers/card.handler';
import { ResourceListService } from './handlers/resource-list.service';
import { AttractapSupervisionHandler } from './handlers/supervision.handler';
import { WebsocketService } from './websocket.service';
import { AttractapEvent, AttractapEventType, AuthenticatedWebSocket } from './websocket.types';

export abstract class AttractapGatewayRouteContext {
  protected abstract makeStringLVGLReady(input: string): string;
  protected abstract readonly connectedAt: WeakMap<object, bigint>;
  protected abstract readonly logger: Logger;
  protected abstract licenseService: LicenseService;
  protected abstract sanitizeForLVGL<T>(value: T): T;
  protected abstract waitForClientResponse(
    client: AuthenticatedWebSocket,
    type: AttractapEventType,
    timeoutMs?: number,
  ): Promise<void>;
  protected abstract websocketService: WebsocketService;
  protected abstract metricsService: MetricsService;
  protected abstract clientWasActive(socket: AuthenticatedWebSocket): Promise<void>;
  protected abstract readonly clientResponseAwaitersMutex: Mutex;
  protected abstract clientResponseAwaiters: Array<{
    id: string;
    clientId: string;
    type: AttractapEventType;
    resolve: () => void;
    timeoutId: NodeJS.Timeout;
  }>;
  protected abstract metricsToggle: MetricsToggleService;
  protected abstract wsMetrics: WsMetrics;
  protected abstract supervisionHandler: AttractapSupervisionHandler;
  protected abstract attractapService: AttractapService;
  protected abstract resolveClientResponseAwaiters(
    client: AuthenticatedWebSocket,
    type: AttractapEventType,
  ): Promise<void>;
  protected abstract readonly eventHandlers: Record<
    AttractapEventType,
    (socket: AuthenticatedWebSocket, eventData: AttractapEvent['data']) => unknown
  >;
  protected abstract resourceListService: ResourceListService;
  protected abstract cardHandler: AttractapCardHandler;
}
