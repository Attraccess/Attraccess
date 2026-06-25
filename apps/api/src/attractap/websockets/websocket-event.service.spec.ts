import { Test, TestingModule } from '@nestjs/testing';
import { WebSocketEventService } from './websocket-event.service';
import { AttractapGateway } from './websocket.gateway';
import { ReaderDeletedEvent, ReaderUpdatedEvent } from '../events';
import { ResourceSessionStartedEvent, ResourceUsageSessionTakenOverEvent } from '../../resources/usage/events/resource-usage.events';
import { ResourceChangedEvent } from '../../resources/events/resource-changed.event';
import { ResourceMaintenanceChangedEvent } from '../../resources/maintenances/events/resource-maintenance-changed.event';
import { ResourceHealthChangedEvent } from '../../resources/health/events/resource-health-changed.event';
import { ResourceHealthStatus } from '@attraccess/database-entities';

describe('WebSocketEventService', () => {
  let service: WebSocketEventService;
  let gateway: jest.Mocked<Pick<AttractapGateway, 'sendResourceList' | 'disconnectReader' | 'sendResourceListToReadersWithResource'>>;

  beforeEach(async () => {
    gateway = {
      sendResourceList: jest.fn().mockResolvedValue(undefined),
      disconnectReader: jest.fn().mockResolvedValue(undefined),
      sendResourceListToReadersWithResource: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebSocketEventService,
        {
          provide: AttractapGateway,
          useValue: gateway,
        },
      ],
    }).compile();

    service = module.get(WebSocketEventService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onReaderUpdated', () => {
    it('calls sendResourceList with the reader id', async () => {
      const event = { reader: { id: 42 } } as ReaderUpdatedEvent;
      await service.onReaderUpdated(event);
      expect(gateway.sendResourceList).toHaveBeenCalledWith(42);
    });
  });

  describe('onReaderDeleted', () => {
    it('calls disconnectReader with the reader id', async () => {
      const event = { readerId: 7 } as ReaderDeletedEvent;
      await service.onReaderDeleted(event);
      expect(gateway.disconnectReader).toHaveBeenCalledWith(7);
    });
  });

  describe('onResourceUsage', () => {
    it('calls sendResourceListToReadersWithResource with the resource id', async () => {
      const event = { usage: { resource: { id: 10 } } } as unknown as ResourceSessionStartedEvent;
      await service.onResourceUsage(event);
      expect(gateway.sendResourceListToReadersWithResource).toHaveBeenCalledWith(10);
    });
  });

  describe('onResourceUsageTakenOver', () => {
    it('calls sendResourceListToReadersWithResource with the resource id', async () => {
      const event = { resource: { id: 20 } } as unknown as ResourceUsageSessionTakenOverEvent;
      await service.onResourceUsageTakenOver(event);
      expect(gateway.sendResourceListToReadersWithResource).toHaveBeenCalledWith(20);
    });
  });

  describe('onResourceChanged', () => {
    it('calls sendResourceListToReadersWithResource with the resource id', async () => {
      const event = new ResourceChangedEvent(30);
      await service.onResourceChanged(event);
      expect(gateway.sendResourceListToReadersWithResource).toHaveBeenCalledWith(30);
    });
  });

  describe('onResourceMaintenanceChanged', () => {
    it('calls sendResourceListToReadersWithResource with the resource id', async () => {
      const event = { resourceId: 40 } as ResourceMaintenanceChangedEvent;
      await service.onResourceMaintenanceChanged(event);
      expect(gateway.sendResourceListToReadersWithResource).toHaveBeenCalledWith(40);
    });
  });

  describe('onResourceHealthChanged', () => {
    it('calls sendResourceListToReadersWithResource with the resource id', async () => {
      const event = new ResourceHealthChangedEvent(
        50,
        '',
        ResourceHealthStatus.HEALTHY,
        null,
        ResourceHealthStatus.UNHEALTHY,
      );
      await service.onResourceHealthChanged(event);
      expect(gateway.sendResourceListToReadersWithResource).toHaveBeenCalledWith(50);
    });
  });
});
