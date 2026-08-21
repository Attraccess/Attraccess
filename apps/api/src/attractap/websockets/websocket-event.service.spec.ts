import { Test, TestingModule } from '@nestjs/testing';
import { WebSocketEventService } from './websocket-event.service';
import { AttractapGateway } from './websocket.gateway';
import { ReaderDeletedEvent, ReaderUpdatedEvent } from '../events';
import {
  ResourceSessionStartedEvent,
  ResourceUsageSessionTakenOverEvent,
} from '../../resources/usage/events/resource-usage.events';
import { ResourceChangedEvent } from '../../resources/events/resource-changed.event';
import { ResourceMaintenanceChangedEvent } from '../../resources/maintenances/events/resource-maintenance-changed.event';
import { ResourceHealthChangedEvent } from '../../resources/health/events/resource-health-changed.event';
import { ResourceIntroducerChangedEvent } from '../../resources/introducers/events/resource-introducer-changed.event';
import { ResourceGroup, ResourceHealthStatus } from '@attraccess/database-entities';
import { ResourceGroupIntroducerChangedEvent } from '../../resources/groups/introducers/events/resource-group-introducer-changed.event';
import { ResourceGroupIntroductionChangedEvent } from '../../resources/groups/introductions/events/resource-group-introduction-changed.event';
import { ResourceGroupsService } from '../../resources/groups/resourceGroups.service';

describe('WebSocketEventService', () => {
  let service: WebSocketEventService;
  let gateway: jest.Mocked<
    Pick<
      AttractapGateway,
      | 'sendResourceList'
      | 'disconnectReader'
      | 'sendResourceListToReadersWithResources'
    >
  >;
  let resourceGroupsService: jest.Mocked<Pick<ResourceGroupsService, 'getOne'>>;

  beforeEach(async () => {
    gateway = {
      sendResourceList: jest.fn().mockResolvedValue(undefined),
      disconnectReader: jest.fn().mockResolvedValue(undefined),
      sendResourceListToReadersWithResources: jest.fn().mockResolvedValue(undefined),
    };
    resourceGroupsService = {
      getOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebSocketEventService,
        {
          provide: AttractapGateway,
          useValue: gateway,
        },
        {
          provide: ResourceGroupsService,
          useValue: resourceGroupsService,
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
    it('calls sendResourceListToReadersWithResources with the resource id', async () => {
      const event = { usage: { resource: { id: 10 } } } as unknown as ResourceSessionStartedEvent;
      await service.onResourceUsage(event);
      expect(gateway.sendResourceListToReadersWithResources).toHaveBeenCalledWith([10]);
    });
  });

  describe('onResourceUsageTakenOver', () => {
    it('calls sendResourceListToReadersWithResources with the resource id', async () => {
      const event = { resource: { id: 20 } } as unknown as ResourceUsageSessionTakenOverEvent;
      await service.onResourceUsageTakenOver(event);
      expect(gateway.sendResourceListToReadersWithResources).toHaveBeenCalledWith([20]);
    });
  });

  describe('onResourceChanged', () => {
    it('calls sendResourceListToReadersWithResources with the resource id', async () => {
      const event = new ResourceChangedEvent(30);
      await service.onResourceChanged(event);
      expect(gateway.sendResourceListToReadersWithResources).toHaveBeenCalledWith([30]);
    });
  });

  describe('onResourceMaintenanceChanged', () => {
    it('calls sendResourceListToReadersWithResources with the resource id', async () => {
      const event = { resourceId: 40 } as ResourceMaintenanceChangedEvent;
      await service.onResourceMaintenanceChanged(event);
      expect(gateway.sendResourceListToReadersWithResources).toHaveBeenCalledWith([40]);
    });
  });

  describe('onResourceHealthChanged', () => {
    it('calls sendResourceListToReadersWithResources with the resource id', async () => {
      const event = new ResourceHealthChangedEvent(
        50,
        '',
        ResourceHealthStatus.HEALTHY,
        null,
        ResourceHealthStatus.UNHEALTHY,
      );
      await service.onResourceHealthChanged(event);
      expect(gateway.sendResourceListToReadersWithResources).toHaveBeenCalledWith([50]);
    });
  });

  describe('onResourceGroupIntroducerChanged', () => {
    it('refreshes each affected reader once for the resources in the group', async () => {
      resourceGroupsService.getOne.mockResolvedValue({ resources: [{ id: 60 }, { id: 70 }] } as ResourceGroup);

      await service.onResourceGroupIntroducerChanged(new ResourceGroupIntroducerChangedEvent(5));

      expect(resourceGroupsService.getOne).toHaveBeenCalledWith({ id: 5 }, ['resources']);
      expect(gateway.sendResourceListToReadersWithResources).toHaveBeenCalledWith([60, 70]);
    });

    it('refreshes resources removed from or added to a group', async () => {
      await service.onResourceGroupIntroductionChanged(new ResourceGroupIntroductionChangedEvent(5, [60]));

      expect(resourceGroupsService.getOne).not.toHaveBeenCalled();
      expect(gateway.sendResourceListToReadersWithResources).toHaveBeenCalledWith([60]);
    });
  });

  describe('onResourceIntroducerChanged', () => {
    it('refreshes readers for the affected resource', async () => {
      await service.onResourceIntroducerChanged(new ResourceIntroducerChangedEvent(60, 10));

      expect(gateway.sendResourceListToReadersWithResources).toHaveBeenCalledWith([60]);
    });
  });
});
