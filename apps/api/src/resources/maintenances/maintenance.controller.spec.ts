import { Test, TestingModule } from '@nestjs/testing';
import { ResourceMaintenanceController } from './maintenance.controller';
import { ResourceMaintenanceService } from './maintenance.service';

// Mock the decorator
jest.mock('./canManageMaintenance.decorator', () => ({
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  CanManageMaintenance: () => () => {},
}));

const mockResource = {
  id: 1,
  name: 'Test Resource',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

const mockMaintenance = {
  id: 1,
  resourceId: 1,
  startTime: new Date('2025-01-01T10:00:00.000Z'),
  endTime: null,
  reason: 'Test maintenance',
  resource: mockResource,
  createdAt: new Date(),
  updatedAt: new Date(),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
} as any;

describe('ResourceMaintenanceController', () => {
  let controller: ResourceMaintenanceController;
  let service: ResourceMaintenanceService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ResourceMaintenanceController],
      providers: [
        {
          provide: ResourceMaintenanceService,
          useValue: {
            createMaintenance: jest.fn(),
            findMaintenances: jest.fn(),
            getMaintenanceById: jest.fn(),
            updateMaintenance: jest.fn(),
            cancelMaintenance: jest.fn(),
            canManageMaintenance: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<ResourceMaintenanceController>(ResourceMaintenanceController);
    service = module.get<ResourceMaintenanceService>(ResourceMaintenanceService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('createMaintenance', () => {
    it('should create a maintenance', async () => {
      const dto = {
        startTime: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
        reason: 'Test maintenance',
      };

      jest.spyOn(service, 'createMaintenance').mockResolvedValue(mockMaintenance);

      const result = await controller.createMaintenance(1, dto);

      expect(result).toEqual(mockMaintenance);
      expect(service.createMaintenance).toHaveBeenCalledWith(1, dto);
    });
  });

  describe('getMaintenances', () => {
    it('should return paginated maintenances', async () => {
      const query = { page: 1, limit: 10 };
      const expectedResponse = {
        data: [mockMaintenance],
        total: 1,
        page: 1,
        limit: 10,
      };

      jest.spyOn(service, 'findMaintenances').mockResolvedValue(expectedResponse);

      const result = await controller.getMaintenances(1, query);

      expect(result).toEqual(expectedResponse);
      expect(service.findMaintenances).toHaveBeenCalledWith(1, query);
    });
  });

  describe('getMaintenance', () => {
    it('should return a specific maintenance', async () => {
      jest.spyOn(service, 'getMaintenanceById').mockResolvedValue(mockMaintenance);

      const result = await controller.getMaintenance(1, 1);

      expect(result).toEqual(mockMaintenance);
      expect(service.getMaintenanceById).toHaveBeenCalledWith(1);
    });
  });

  describe('updateMaintenance', () => {
    it('should update a maintenance', async () => {
      const dto = {
        reason: 'Updated maintenance reason',
      };

      const updatedMaintenance = { ...mockMaintenance, reason: dto.reason };

      jest.spyOn(service, 'getMaintenanceById').mockResolvedValue(mockMaintenance);
      jest.spyOn(service, 'updateMaintenance').mockResolvedValue(updatedMaintenance);

      const result = await controller.updateMaintenance(1, 1, dto);

      expect(result).toEqual(updatedMaintenance);
      expect(service.getMaintenanceById).toHaveBeenCalledWith(1);
      expect(service.updateMaintenance).toHaveBeenCalledWith(1, dto);
    });

    it('should update maintenance with start time and end time', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1); // Tomorrow

      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 2); // Day after tomorrow

      const dto = {
        startTime: futureDate.toISOString(),
        endTime: endDate.toISOString(),
        reason: 'Updated maintenance',
      };

      const updatedMaintenance = { ...mockMaintenance, ...dto };

      jest.spyOn(service, 'getMaintenanceById').mockResolvedValue(mockMaintenance);
      jest.spyOn(service, 'updateMaintenance').mockResolvedValue(updatedMaintenance);

      const result = await controller.updateMaintenance(1, 1, dto);

      expect(result).toEqual(updatedMaintenance);
      expect(service.getMaintenanceById).toHaveBeenCalledWith(1);
      expect(service.updateMaintenance).toHaveBeenCalledWith(1, dto);
    });
  });

  describe('cancelMaintenance', () => {
    it('should cancel a maintenance', async () => {
      jest.spyOn(service, 'getMaintenanceById').mockResolvedValue(mockMaintenance);
      jest.spyOn(service, 'cancelMaintenance').mockResolvedValue(undefined);

      await controller.cancelMaintenance(1, 1);

      expect(service.getMaintenanceById).toHaveBeenCalledWith(1);
      expect(service.cancelMaintenance).toHaveBeenCalledWith(1);
    });
  });

  describe('canManageMaintenance', () => {
    it('should check if user can manage maintenance', async () => {
      const mockUser = { id: 1, name: 'Test User' };
      const mockRequest = { user: mockUser };

      jest.spyOn(service, 'canManageMaintenance').mockResolvedValue(true);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await controller.canManageMaintenance(1, mockRequest as any);

      expect(result).toEqual({
        canManage: true,
        resourceId: 1,
      });
      expect(service.canManageMaintenance).toHaveBeenCalledWith(mockUser, 1);
    });
  });
});
