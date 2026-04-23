import { Test, TestingModule } from '@nestjs/testing';
import { VersionController } from './version.controller';
import { VersionService } from './version.service';
import { UpdateStatusDto } from './dto/update-status.dto';

describe('VersionController', () => {
  let controller: VersionController;
  let service: jest.Mocked<Pick<VersionService, 'getCurrentVersion' | 'getUpdateStatus'>>;

  beforeEach(async () => {
    service = {
      getCurrentVersion: jest.fn(),
      getUpdateStatus: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [VersionController],
      providers: [{ provide: VersionService, useValue: service }],
    }).compile();

    controller = module.get<VersionController>(VersionController);
  });

  afterEach(() => jest.clearAllMocks());

  describe('GET /version', () => {
    it('delegates to VersionService.getCurrentVersion', () => {
      service.getCurrentVersion.mockReturnValue({ version: '0.0.16' });

      expect(controller.getCurrentVersion()).toEqual({ version: '0.0.16' });
      expect(service.getCurrentVersion).toHaveBeenCalledTimes(1);
    });
  });

  describe('GET /version/updates', () => {
    const sampleStatus: UpdateStatusDto = {
      currentVersion: '0.0.16',
      latestVersion: '0.1.0',
      isUpdateAvailable: true,
      checkSucceeded: true,
      latestRelease: {
        version: '0.1.0',
        tagName: 'v0.1.0',
        name: 'v0.1.0',
        body: 'notes',
        htmlUrl: 'https://github.com/Attraccess/Attraccess/releases/tag/v0.1.0',
        publishedAt: '2026-02-01T00:00:00Z',
      },
    };

    it('returns the update status from the service', async () => {
      service.getUpdateStatus.mockResolvedValue(sampleStatus);

      await expect(controller.getUpdateStatus()).resolves.toEqual(sampleStatus);
      expect(service.getUpdateStatus).toHaveBeenCalledWith(false);
    });

    it('passes forceRefresh=true when refresh query equals "true"', async () => {
      service.getUpdateStatus.mockResolvedValue(sampleStatus);

      await controller.getUpdateStatus('true');

      expect(service.getUpdateStatus).toHaveBeenCalledWith(true);
    });

    it('passes forceRefresh=true when refresh query equals "1"', async () => {
      service.getUpdateStatus.mockResolvedValue(sampleStatus);

      await controller.getUpdateStatus('1');

      expect(service.getUpdateStatus).toHaveBeenCalledWith(true);
    });

    it('passes forceRefresh=false for any other refresh query value', async () => {
      service.getUpdateStatus.mockResolvedValue(sampleStatus);

      await controller.getUpdateStatus('false');
      await controller.getUpdateStatus('');
      await controller.getUpdateStatus(undefined);

      expect(service.getUpdateStatus).toHaveBeenCalledTimes(3);
      expect(service.getUpdateStatus).toHaveBeenNthCalledWith(1, false);
      expect(service.getUpdateStatus).toHaveBeenNthCalledWith(2, false);
      expect(service.getUpdateStatus).toHaveBeenNthCalledWith(3, false);
    });

    it('propagates errors from the service', async () => {
      service.getUpdateStatus.mockRejectedValue(new Error('unexpected'));

      await expect(controller.getUpdateStatus()).rejects.toThrow('unexpected');
    });
  });
});
