import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

describe('firmware asset copying', () => {
  let root: string;
  let assets: string;
  let warning: jest.SpyInstance;
  let failure: jest.SpyInstance;
  const origin = (name: string) => path.join(root, 'apps', name, 'firmware_output');
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'firmware-copy-test-'));
    assets = path.join(root, 'apps/api/src/assets/attractap-firmwares');
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    warning = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    failure = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    jest.restoreAllMocks();
    jest.dontMock('path');
    jest.dontMock('child_process');
    fs.rmSync(root, { recursive: true, force: true });
  });
  const run = () => {
    jest.isolateModules(() => {
      const actualPath = jest.requireActual('path');
      jest.doMock('path', () => ({
        ...actualPath,
        resolve: (_dirname: string, relative: string) => actualPath.resolve(root, 'apps/api', relative),
      }));
      jest.doMock('child_process', () => ({
        execSync: jest.fn((command: string) => {
          const match = /^cp -r "([^"]+)" "([^"]+)"$/.exec(command);
          if (!match || !match[1].startsWith(root) || !match[2].startsWith(root))
            throw new Error('Unexpected copy command');
          fs.cpSync(match[1], match[2], { recursive: true });
        }),
      }));
      require('./copy-attractap-firmware-into-assets.js');
    });
  };
  const writeOrigin = (name: string, manifest: unknown) => {
    const dir = origin(name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'firmwares.json'), JSON.stringify(manifest));
    return dir;
  };
  it('combines manifests, copies images and sidecar directories, and removes stale assets', () => {
    fs.mkdirSync(path.join(assets, 'stale-directory'), { recursive: true });
    fs.writeFileSync(path.join(assets, 'stale.bin'), 'old');
    const dir = writeOrigin('attractap/firmware', {
      firmwares: [
        { filename: 'firmware.bin', filenameOTA: 'ota.bin' },
        { filename: 'missing.bin', filenameOTA: 'missing-ota.bin' },
        { name: 'missing-filename' },
      ],
    });
    fs.writeFileSync(path.join(dir, 'firmware.bin'), 'firmware');
    fs.writeFileSync(path.join(dir, 'ota.bin'), 'ota');
    fs.writeFileSync(path.join(dir, 'symbols.elf'), 'symbols');
    fs.writeFileSync(path.join(dir, 'ignored.json'), '{}');
    fs.mkdirSync(path.join(dir, 'debug'));
    fs.writeFileSync(path.join(dir, 'debug/log.txt'), 'debug');
    writeOrigin('attractap-touch-firmware', { firmwares: [] });
    run();
    expect(fs.readFileSync(path.join(assets, 'firmware.bin'), 'utf8')).toBe('firmware');
    expect(fs.readFileSync(path.join(assets, 'ota.bin'), 'utf8')).toBe('ota');
    expect(fs.readFileSync(path.join(assets, 'symbols.elf'), 'utf8')).toBe('symbols');
    expect(fs.readFileSync(path.join(assets, 'debug/log.txt'), 'utf8')).toBe('debug');
    expect(fs.existsSync(path.join(assets, 'stale.bin'))).toBe(false);
    expect(fs.existsSync(path.join(assets, 'stale-directory'))).toBe(false);
    expect(fs.existsSync(path.join(assets, 'ignored.json'))).toBe(false);
    expect(JSON.parse(fs.readFileSync(path.join(assets, 'firmwares.json'), 'utf8')).firmwares).toHaveLength(3);
  });
  it('skips missing and malformed manifests without touching files outside the fixture', () => {
    const dir = writeOrigin('attractap/firmware', {});
    fs.writeFileSync(path.join(dir, 'firmwares.json'), '{');
    run();
    expect(JSON.parse(fs.readFileSync(path.join(assets, 'firmwares.json'), 'utf8'))).toEqual({ firmwares: [] });
    expect(failure).toHaveBeenCalled();
    expect(warning).toHaveBeenCalled();
  });
  it('still copies extra artifacts when a manifest has no firmware list or is absent', () => {
    const first = writeOrigin('attractap/firmware', {});
    fs.writeFileSync(path.join(first, 'extra.bin'), 'extra');
    const second = origin('attractap-touch-firmware');
    fs.mkdirSync(second, { recursive: true });
    fs.writeFileSync(path.join(second, 'touch.bin'), 'touch');
    run();
    expect(fs.readFileSync(path.join(assets, 'extra.bin'), 'utf8')).toBe('extra');
    expect(fs.readFileSync(path.join(assets, 'touch.bin'), 'utf8')).toBe('touch');
  });
});
