import { NotFoundException } from '@nestjs/common';
import { CompanionDownloadController } from './companion.controller';
import { CompanionService } from './companion.service';
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

describe('CompanionDownloadController', () => {
  describe('getVersions', () => {
    it('returns the manifest', () => {
      const svc = makeService();
      const ctrl = new CompanionDownloadController(svc);
      expect(ctrl.getVersions()).toEqual(MANIFEST);
    });

    it('throws NotFoundException when no manifest', () => {
      const svc = makeService();
      svc.getManifest.mockReturnValue(null);
      const ctrl = new CompanionDownloadController(svc);
      expect(() => ctrl.getVersions()).toThrow(NotFoundException);
    });
  });

  describe('downloadBinary', () => {
    it('pipes the stream with correct headers', async () => {
      const fakeStream = { on: jest.fn().mockReturnThis(), pipe: jest.fn() };
      const svc = makeService();
      svc.getBinaryStream.mockReturnValue({ stream: fakeStream as never, size: 42000, filename: 'companion-linux-x64.AppImage' });

      const res = makeRes();
      const ctrl = new CompanionDownloadController(svc);
      await ctrl.downloadBinary('linux', 'x64', res as unknown as Response);

      expect(res.set).toHaveBeenCalledWith(expect.objectContaining({
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': 'attachment; filename="companion-linux-x64.AppImage"',
        'Content-Length': '42000',
        'Cache-Control': 'no-cache',
      }));
      expect(fakeStream.pipe).toHaveBeenCalledWith(res);
    });

    it('returns 404 when getBinaryStream throws NotFoundException', async () => {
      const svc = makeService();
      svc.getBinaryStream.mockImplementation(() => { throw new NotFoundException('not found'); });

      const res = makeRes();
      const ctrl = new CompanionDownloadController(svc);
      await ctrl.downloadBinary('win32', 'x64', res as unknown as Response);

      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.send).toHaveBeenCalledWith('not found');
    });
  });
});
