import { CoredumpSymbolicationService } from './coredump-symbolication.service';
import { AttractapFirmwareService } from './firmware.service';
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

function makeService(firmware: Partial<AttractapFirmwareService>): CoredumpSymbolicationService {
  return new CoredumpSymbolicationService(firmware as AttractapFirmwareService);
}

describe('CoredumpSymbolicationService', () => {
  const tempDirs: string[] = [];
  const originalCmd = process.env.ESP_COREDUMP_CMD;

  function tempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'symbolication-test-'));
    tempDirs.push(dir);
    return dir;
  }

  afterEach(() => {
    if (originalCmd === undefined) {
      delete process.env.ESP_COREDUMP_CMD;
    } else {
      process.env.ESP_COREDUMP_CMD = originalCmd;
    }
  });

  afterAll(() => {
    tempDirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
  });

  it('returns skipped when there is no coredump', async () => {
    const service = makeService({ resolveElfFile: jest.fn() });
    const result = await service.symbolicate(null, { variant: 'eth', buildId: null });
    expect(result.status).toBe('skipped');
    expect(result.backtrace).toBeNull();
  });

  it('returns failed when no matching ELF is found', async () => {
    const service = makeService({ resolveElfFile: jest.fn().mockReturnValue(null) });
    const result = await service.symbolicate(Buffer.from('core'), { variant: 'eth', buildId: null });
    expect(result.status).toBe('failed');
    expect(result.backtrace).toContain('No matching firmware ELF');
  });

  it('returns unavailable when the esp-coredump tool is missing', async () => {
    process.env.ESP_COREDUMP_CMD = join(tempDir(), 'does-not-exist-esp-coredump');
    const elfDir = tempDir();
    const elfPath = join(elfDir, 'fw.elf');
    writeFileSync(elfPath, 'elf');
    const service = makeService({
      resolveElfFile: jest.fn().mockReturnValue({ path: elfPath, firmware: { chip: 'esp32s3', buildId: 'abc' } }),
    });
    const result = await service.symbolicate(Buffer.from('core'), { variant: 'eth', buildId: null });
    expect(result.status).toBe('unavailable');
  });

  it('returns success and the tool output when symbolication succeeds', async () => {
    const binDir = tempDir();
    const fakeTool = join(binDir, 'fake-esp-coredump');
    writeFileSync(fakeTool, '#!/bin/sh\necho "#0 0x42066718 in ApplicationLoop::tick() at main.cpp:212"\n');
    chmodSync(fakeTool, 0o755);
    process.env.ESP_COREDUMP_CMD = fakeTool;

    const elfPath = join(binDir, 'fw.elf');
    writeFileSync(elfPath, 'elf');
    const service = makeService({
      resolveElfFile: jest
        .fn()
        .mockReturnValue({ path: elfPath, firmware: { chip: 'esp32s3', buildId: 'f6899cb1067e5043' } }),
    });

    const result = await service.symbolicate(Buffer.from('core'), { variant: 'eth', buildId: null });
    expect(result.status).toBe('success');
    expect(result.backtrace).toContain('ApplicationLoop::tick()');
    expect(result.buildId).toBe('f6899cb1067e5043');
  });
});
