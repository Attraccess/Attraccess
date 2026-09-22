import { join } from 'path';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { AttractapFirmwareService } from './firmware.service';
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  copyFileSync: jest.fn(),
}));
const assets = join(__dirname, 'assets', 'attractap-firmwares');
const archive = join('/fixture-storage', 'attractap-firmware-symbols');
const bundled = {
  name: 'reader',
  variant: 'standard',
  filename: 'reader.bin',
  elfFilename: 'reader.elf',
  buildId: 'ABCDEF1234',
  version: '1.2',
};
const old = { ...bundled, buildId: '987654abcd', elfFilename: 'old.elf', version: '1.1' };
let files: Map<string, string>;
let oldStorage: string | undefined;
beforeEach(() => {
  jest.clearAllMocks();
  oldStorage = process.env.STORAGE_ROOT;
  process.env.STORAGE_ROOT = '/fixture-storage';
  files = new Map([
    [join(assets, 'firmwares.json'), JSON.stringify({ firmwares: [bundled] })],
    [join(assets, 'reader.elf'), 'ELF-fixture'],
  ]);
  jest.mocked(existsSync).mockImplementation((path) => files.has(String(path)));
  jest.mocked(readFileSync).mockImplementation((path) => {
    const value = files.get(String(path));
    if (value === undefined) throw new Error('Missing fixture');
    return value;
  });
  jest.mocked(writeFileSync).mockImplementation((path, content) => {
    files.set(String(path), String(content));
  });
  jest.mocked(copyFileSync).mockImplementation((from, to) => {
    files.set(String(to), files.get(String(from)) ?? '');
  });
});
afterEach(() => {
  if (oldStorage === undefined) delete process.env.STORAGE_ROOT;
  else process.env.STORAGE_ROOT = oldStorage;
});
it('archives bundled symbols once and resolves abbreviated or case-insensitive build IDs', () => {
  const service = new AttractapFirmwareService();
  expect(mkdirSync).toHaveBeenCalledWith(archive, { recursive: true });
  expect(copyFileSync).toHaveBeenCalledWith(join(assets, 'reader.elf'), join(archive, 'abcdef1234-reader.elf'));
  expect(JSON.parse(files.get(join(archive, 'firmwares.json')) ?? '{}').firmwares).toEqual([
    { ...bundled, elfFilename: 'abcdef1234-reader.elf' },
  ]);
  expect(service.getFirmwareByBuildId(' ABCDEF ')).toEqual(bundled);
  expect(service.hasSymbolForBuildId('abcdef123456')).toBe(true);
  expect(service.resolveElfFile({ buildId: 'abcdef' })).toEqual({
    path: join(assets, 'reader.elf'),
    firmware: bundled,
  });
  expect(service.getFirmwareByBuildId(' ')).toBeUndefined();
  expect(service.resolveElfFile({ buildId: 'unknown', variant: 'standard' })?.firmware).toEqual(bundled);
  new AttractapFirmwareService();
  expect(copyFileSync).toHaveBeenCalledTimes(1);
  expect(writeFileSync).toHaveBeenCalledTimes(1);
});
it('retains old symbols for crash reports but ignores incomplete or missing archived entries', () => {
  files.set(
    join(archive, 'firmwares.json'),
    JSON.stringify({
      firmwares: [
        old,
        { ...old, buildId: 'missing', elfFilename: 'missing.elf' },
        { ...old, buildId: null },
        { ...old, elfFilename: null },
      ],
    }),
  );
  files.set(join(archive, 'old.elf'), 'old-ELF');
  const service = new AttractapFirmwareService();
  expect(service.resolveElfFile({ buildId: '987654' })).toEqual({ path: join(archive, 'old.elf'), firmware: old });
  expect(service.hasSymbolForBuildId('missing')).toBe(false);
  files.delete(join(archive, 'old.elf'));
  expect(service.resolveElfFile({ buildId: '987654' })).toBeNull();
  expect(service.resolveElfFile({ variant: 'missing' })).toBeNull();
});
it('tolerates a damaged archive and skips missing or unidentifiable bundled ELF files', () => {
  files.set(join(archive, 'firmwares.json'), 'invalid-json');
  files.set(
    join(assets, 'firmwares.json'),
    JSON.stringify({
      firmwares: [
        { ...bundled, buildId: null },
        { ...bundled, elfFilename: null },
        { ...bundled, elfFilename: 'missing.elf' },
      ],
    }),
  );
  const service = new AttractapFirmwareService();
  expect(copyFileSync).not.toHaveBeenCalled();
  expect(writeFileSync).not.toHaveBeenCalled();
  expect(service.resolveElfFile({ variant: 'missing' })).toBeNull();
});
