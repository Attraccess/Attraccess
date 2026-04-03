import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';
import { Response } from 'express';

describe('MetricsController', () => {
  let controller: MetricsController;
  let metricsService: jest.Mocked<Pick<MetricsService, 'getMetrics' | 'getContentType'>>;

  beforeEach(() => {
    metricsService = {
      getMetrics: jest.fn().mockResolvedValue('# HELP attraccess_http_requests_total\nattraccess_http_requests_total 42\n'),
      getContentType: jest.fn().mockReturnValue('text/plain; version=0.0.4; charset=utf-8'),
    };
    controller = new MetricsController(metricsService as unknown as MetricsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('getMetrics (issue #11: dynamic Content-Type)', () => {
    it('sets Content-Type dynamically from registry, not hardcoded', async () => {
      const mockRes = {
        set: jest.fn(),
        end: jest.fn(),
      } as unknown as Response;

      await controller.getMetrics(mockRes);

      expect(metricsService.getContentType).toHaveBeenCalled();
      expect(mockRes.set).toHaveBeenCalledWith('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    });

    it('writes metrics body to response', async () => {
      const mockRes = {
        set: jest.fn(),
        end: jest.fn(),
      } as unknown as Response;

      await controller.getMetrics(mockRes);

      expect(mockRes.end).toHaveBeenCalledWith(expect.stringContaining('attraccess_http_requests_total'));
    });

    it('uses registry content type even if it changes (e.g. OpenMetrics)', async () => {
      metricsService.getContentType.mockReturnValue('application/openmetrics-text; version=1.0.0; charset=utf-8');

      const mockRes = {
        set: jest.fn(),
        end: jest.fn(),
      } as unknown as Response;

      await controller.getMetrics(mockRes);

      expect(mockRes.set).toHaveBeenCalledWith('Content-Type', 'application/openmetrics-text; version=1.0.0; charset=utf-8');
    });
  });
});
