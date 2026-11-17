import { NotFoundException } from '@nestjs/common';
import { CompanionService } from './companion.service';
import { FakeCompanionDeviceStore } from './fake-companion-device.store';

jest.mock('bcrypt', () => ({
  genSalt: jest.fn(),
  hash: jest.fn(),
  compare: jest.fn(),
}));

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

let store: FakeCompanionDeviceStore;

function makeService(hasManifest = true): CompanionService {
  fs.existsSync.mockReturnValue(hasManifest);
  if (hasManifest) {
    fs.readFileSync.mockReturnValue(JSON.stringify(MANIFEST));
  }
  return new CompanionService(store);
}

describe('CompanionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    store = new FakeCompanionDeviceStore();
  });

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

  describe('device management', () => {
    const bcrypt = jest.requireMock('bcrypt') as { genSalt: jest.Mock; hash: jest.Mock; compare: jest.Mock };

    it('registers a device with a hashed token and returns the plain token once', async () => {
      bcrypt.genSalt.mockResolvedValue('salt');
      bcrypt.hash.mockResolvedValue('hashed');
      const svc = makeService(false);

      const { device, token } = await svc.createDevice();

      expect(token).toHaveLength(64);
      expect(device.tokenHash).toBe('hashed');
      expect(device.name).toHaveLength(4);
      expect(await svc.findById(device.id)).toMatchObject({ id: device.id, tokenHash: 'hashed' });
    });

    it('verifies tokens against the stored hash', async () => {
      bcrypt.compare.mockResolvedValue(true);
      const svc = makeService(false);
      const device = await store.registerDevice({ name: 'abcd', tokenHash: 'h' });
      await expect(svc.verifyToken(device, 'tok')).resolves.toBe(true);
      expect(bcrypt.compare).toHaveBeenCalledWith('tok', 'h');
    });

    it('records the connection with the reported app version', async () => {
      const svc = makeService(false);
      const device = await store.registerDevice({ name: 'abcd', tokenHash: 'h' });
      await svc.touchLastConnection(device, '2.0.0');
      expect((await svc.findById(device.id))?.appVersion).toBe('2.0.0');
    });

    it('renames, lists and deletes devices', async () => {
      const svc = makeService(false);
      const device = await store.registerDevice({ name: 'abcd', tokenHash: 'h' });
      expect((await svc.updateName(device.id, 'Desk PC')).name).toBe('Desk PC');
      expect(await svc.findAll()).toHaveLength(1);
      await svc.delete(device.id);
      expect(await svc.findById(device.id)).toBeNull();
    });
  });
});
