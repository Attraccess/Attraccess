import { NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { CompanionDevice } from '@attraccess/database-entities';
import { CompanionService } from './companion.service';

jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  statSync: jest.fn(),
  createReadStream: jest.fn(),
}));

const fs = jest.requireMock('fs') as {
  existsSync: jest.Mock;
  readFileSync: jest.Mock;
  statSync: jest.Mock;
  createReadStream: jest.Mock;
};

const MANIFEST = {
  version: '1.0.0',
  buildId: 'abc123',
  platforms: [
    { platform: 'linux', arch: 'x64', filename: 'companion-linux-x64.AppImage' },
    { platform: 'darwin', arch: 'arm64', filename: 'companion-darwin-arm64.dmg' },
  ],
};

const mockRepo = {} as Repository<CompanionDevice>;

function makeService(hasManifest = true): CompanionService {
  fs.existsSync.mockReturnValue(hasManifest);
  if (hasManifest) {
    fs.readFileSync.mockReturnValue(JSON.stringify(MANIFEST));
  }
  return new CompanionService(mockRepo);
}

describe('CompanionService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('getManifest', () => {
    it('returns manifest when companions.json exists', () => {
      const svc = makeService(true);
      expect(svc.getManifest()).toEqual(MANIFEST);
    });

    it('returns null when companions.json is missing', () => {
      const svc = makeService(false);
      expect(svc.getManifest()).toBeNull();
    });
  });

  describe('getLatestVersion', () => {
    it('returns version and buildId', () => {
      const svc = makeService(true);
      expect(svc.getLatestVersion()).toEqual({ version: '1.0.0', buildId: 'abc123' });
    });

    it('returns null when no manifest', () => {
      const svc = makeService(false);
      expect(svc.getLatestVersion()).toBeNull();
    });
  });

  describe('getBinaryStream', () => {
    it('returns stream, size and filename for known platform/arch', () => {
      const svc = makeService(true);
      const fakeStream = {};
      fs.existsSync.mockReturnValue(true);
      fs.statSync.mockReturnValue({ size: 42000 });
      fs.createReadStream.mockReturnValue(fakeStream);

      const result = svc.getBinaryStream('linux', 'x64');
      expect(result).toEqual({ stream: fakeStream, size: 42000, filename: 'companion-linux-x64.AppImage' });
    });

    it('throws NotFoundException for unknown platform/arch', () => {
      const svc = makeService(true);
      expect(() => svc.getBinaryStream('win32', 'x64')).toThrow(NotFoundException);
    });

    it('throws NotFoundException when binary file is missing on disk', () => {
      const svc = makeService(true);
      // First call (in constructor) returns true, subsequent calls for binary file return false
      fs.existsSync.mockReturnValueOnce(false);
      expect(() => svc.getBinaryStream('linux', 'x64')).toThrow(NotFoundException);
    });

    it('throws NotFoundException when no manifest is loaded', () => {
      const svc = makeService(false);
      expect(() => svc.getBinaryStream('linux', 'x64')).toThrow(NotFoundException);
    });
  });
});
