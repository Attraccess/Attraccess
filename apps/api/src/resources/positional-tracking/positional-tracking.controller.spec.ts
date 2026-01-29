import { Test, TestingModule } from '@nestjs/testing';
import { PositionalTrackingController } from './positional-tracking.controller';
import { PositionalTrackingService } from './positional-tracking.service';

const mockGateway = {
  id: 1,
  identifier: 'GW-001',
  coordinates: { x: 0, y: 0 },
  calibration: {
    txPowerAt1m: -55,
    pathLossExponent: 2.1,
    calibrationUpdatedAt: '2026-01-28T12:00:00.000Z',
  },
};

describe('PositionalTrackingController', () => {
  let controller: PositionalTrackingController;
  let service: PositionalTrackingService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PositionalTrackingController],
      providers: [
        {
          provide: PositionalTrackingService,
          useValue: {
            getDebugStream: jest.fn(),
            listGatewaysForCalibration: jest.fn(),
            getGatewayForCalibration: jest.fn(),
            updateGatewayCalibration: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<PositionalTrackingController>(PositionalTrackingController);
    service = module.get<PositionalTrackingService>(PositionalTrackingService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('listGateways', () => {
    it('returns gateways for calibration', async () => {
      jest.spyOn(service, 'listGatewaysForCalibration').mockResolvedValue([mockGateway]);

      const result = await controller.listGateways();

      expect(result).toEqual([mockGateway]);
      expect(service.listGatewaysForCalibration).toHaveBeenCalled();
    });
  });

  describe('getGateway', () => {
    it('returns a gateway by id', async () => {
      jest.spyOn(service, 'getGatewayForCalibration').mockResolvedValue(mockGateway);

      const result = await controller.getGateway(1);

      expect(result).toEqual(mockGateway);
      expect(service.getGatewayForCalibration).toHaveBeenCalledWith(1);
    });
  });

  describe('updateGatewayCalibration', () => {
    it('updates gateway calibration', async () => {
      const dto = { txPowerAt1m: -52, pathLossExponent: 2.3 };
      const updated = { ...mockGateway, calibration: { ...mockGateway.calibration, ...dto } };
      jest.spyOn(service, 'updateGatewayCalibration').mockResolvedValue(updated);

      const result = await controller.updateGatewayCalibration(1, dto);

      expect(result).toEqual(updated);
      expect(service.updateGatewayCalibration).toHaveBeenCalledWith(1, dto);
    });
  });
});
