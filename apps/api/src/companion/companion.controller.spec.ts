import { NotFoundException } from '@nestjs/common';
import { CompanionDownloadController } from './companion.controller';
import { CompanionService } from './companion.service';
import { MetricsService } from '../metrics/metrics.service';
import { Response } from 'express';

const MANIFEST = {
  version: '1.0.0',
  buildId: 'abc123',
  platforms: [{ platform: 'linux', arch: 'x64', filename: 'companion-linux-x64.AppImage' }],
};

function makeRes(): jest.Mocked<Partial<Response>> & { headersSent: boolean } {
  const pipe = jest.fn();
  const stream = { on: jest.fn().mockReturnThis(), pipe };
  return {
    headersSent: false,
    set: jest.fn(),
    status: jest.fn().mockReturnThis(),
    send: jest.fn(),
    _stream: stream,
  } as unknown as jest.Mocked<Partial<Response>> & { headersSent: boolean };
}

function makeService(manifest = MANIFEST): jest.Mocked<CompanionService> {
  return {
    getManifest: jest.fn().mockReturnValue(manifest),
    getLatestVersion: jest.fn().mockReturnValue({ version: manifest.version, buildId: manifest.buildId }),
    getBinaryStream: jest.fn(),
  } as unknown as jest.Mocked<CompanionService>;
}

function makeMetrics(): { companionDownloadsTotal: { inc: jest.Mock } } {
  return { companionDownloadsTotal: { inc: jest.fn() } };
}

describe('CompanionDownloadController', () => {
  describe('getVersions', () => {
    it('returns the manifest', () => {
      const svc = makeService();
      const ctrl = new CompanionDownloadController(svc, makeMetrics() as unknown as MetricsService);
      expect(ctrl.getVersions()).toEqual(MANIFEST);
    });

    it('throws NotFoundException when no manifest', () => {
      const svc = makeService();
      svc.getManifest.mockReturnValue(null);
      const ctrl = new CompanionDownloadController(svc, makeMetrics() as unknown as MetricsService);
      expect(() => ctrl.getVersions()).toThrow(NotFoundException);
    });
  });

  describe('downloadBinary', () => {
    it('pipes the stream with correct headers and records success metric', async () => {
      const fakeStream = { on: jest.fn().mockReturnThis(), pipe: jest.fn() };
      const svc = makeService();
      svc.getBinaryStream.mockReturnValue({ stream: fakeStream as never, size: 42000, filename: 'companion-linux-x64.AppImage' });

      const res = makeRes();
      const metrics = makeMetrics();
      const ctrl = new CompanionDownloadController(svc, metrics as unknown as MetricsService);
      await ctrl.downloadBinary('linux', 'x64', res as unknown as Response);

      expect(res.set).toHaveBeenCalledWith(expect.objectContaining({
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': 'attachment; filename="companion-linux-x64.AppImage"',
        'Content-Length': '42000',
        'Cache-Control': 'no-cache',
      }));
      expect(fakeStream.pipe).toHaveBeenCalledWith(res);
      expect(metrics.companionDownloadsTotal.inc).toHaveBeenCalledWith({ platform: 'linux', arch: 'x64', status: 'success' });
    });

    it('returns 404 and records not_found metric when getBinaryStream throws NotFoundException', async () => {
      const svc = makeService();
      svc.getBinaryStream.mockImplementation(() => { throw new NotFoundException('not found'); });

      const res = makeRes();
      const metrics = makeMetrics();
      const ctrl = new CompanionDownloadController(svc, metrics as unknown as MetricsService);
      await ctrl.downloadBinary('win32', 'x64', res as unknown as Response);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.send).toHaveBeenCalledWith('not found');
      expect(metrics.companionDownloadsTotal.inc).toHaveBeenCalledWith({ platform: 'win32', arch: 'x64', status: 'not_found' });
    });

    it('returns 500 and records error metric on unexpected error', async () => {
      const svc = makeService();
      svc.getBinaryStream.mockImplementation(() => { throw new Error('disk failure'); });

      const res = makeRes();
      const metrics = makeMetrics();
      const ctrl = new CompanionDownloadController(svc, metrics as unknown as MetricsService);
      await ctrl.downloadBinary('linux', 'x64', res as unknown as Response);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(metrics.companionDownloadsTotal.inc).toHaveBeenCalledWith({ platform: 'linux', arch: 'x64', status: 'error' });
    });
  });
});
