import { CoredumpSymbolicationService } from './coredump-symbolication.service';
import { AttractapFirmwareService } from './firmware.service';
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

function makeService(firmware: Partial<AttractapFirmwareService>): CoredumpSymbolicationService {
  return new CoredumpSymbolicationService(firmware as AttractapFirmwareService);
}

/**
 * Builds a coredump buffer matching the real ESP32 flash format produced by esp-idf:
 * 20-byte flash header, inner ELF, and an ESP_CORE_DUMP_INFO ELF note whose payload is
 * a u32 version followed by the truncated app ELF SHA256 as a zero-terminated ASCII
 * hex string (esp_core_dump_elf.c).
 */
function buildCoredumpFixture(sha: string | null): Buffer {
  // Flash header: data_len, version, tasks_num, tcb_sz, mem_segs_num
  const flashHeader = Buffer.alloc(20);
  flashHeader.writeUInt32LE(4096, 0);
  flashHeader.writeUInt32LE(0x00010000, 4); // ELF format version
  flashHeader.writeUInt32LE(12, 8);
  flashHeader.writeUInt32LE(352, 12);
  flashHeader.writeUInt32LE(2, 16);

  // Minimal Elf32_Ehdr (magic + zero padding)
  const elfHeader = Buffer.concat([Buffer.from('\x7fELF', 'latin1'), Buffer.alloc(48)]);

  // ELF note: namesz/descsz/type header, 4-byte-padded name and desc
  const name = Buffer.from('ESP_CORE_DUMP_INFO\0', 'latin1');
  const namePadded = Buffer.concat([name, Buffer.alloc((4 - (name.length % 4)) % 4)]);
  const desc = Buffer.concat([
    Buffer.from([0x00, 0x02, 0x00, 0x00]), // note payload version (u32)
    sha === null ? Buffer.alloc(0) : Buffer.from(`${sha}\0`, 'latin1'),
  ]);
  const descPadded = Buffer.concat([desc, Buffer.alloc((4 - (desc.length % 4)) % 4)]);
  const noteHeader = Buffer.alloc(12);
  noteHeader.writeUInt32LE(name.length, 0);
  noteHeader.writeUInt32LE(desc.length, 4);
  noteHeader.writeUInt32LE(8266, 8); // ELF_ESP_CORE_DUMP_INFO_TYPE

  // Trailing task/memory segments (binary noise, must not be mistaken for a build id)
  const trailingMemory = Buffer.alloc(64, 0xa5);

  return Buffer.concat([flashHeader, elfHeader, noteHeader, namePadded, descPadded, trailingMemory]);
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

  describe('extractBuildId', () => {
    it('extracts the truncated app ELF SHA256 from a coredump', () => {
      const service = makeService({});
      expect(service.extractBuildId(buildCoredumpFixture('f6899cb1067e5043'))).toBe('f6899cb1067e5043');
    });

    it('normalizes the build id to lowercase', () => {
      const service = makeService({});
      expect(service.extractBuildId(buildCoredumpFixture('F6899CB1067E5043'))).toBe('f6899cb1067e5043');
    });

    it('returns null when the coredump has no ESP_CORE_DUMP_INFO note', () => {
      const service = makeService({});
      expect(service.extractBuildId(Buffer.alloc(256, 0xa5))).toBeNull();
    });

    it('returns null when the note carries no sha (truncated dump)', () => {
      const service = makeService({});
      expect(service.extractBuildId(buildCoredumpFixture(null))).toBeNull();
    });
  });

  it('extracts the build id from the coredump and resolves the ELF strictly by it', async () => {
    const binDir = tempDir();
    const fakeTool = join(binDir, 'fake-esp-coredump');
    writeFileSync(fakeTool, '#!/bin/sh\necho "#0 0x42066718 in ApplicationLoop::tick() at main.cpp:212"\n');
    chmodSync(fakeTool, 0o755);
    process.env.ESP_COREDUMP_CMD = fakeTool;

    const elfPath = join(binDir, 'fw.elf');
    writeFileSync(elfPath, 'elf');
    const resolveElfFile = jest
      .fn()
      .mockReturnValue({ path: elfPath, firmware: { chip: 'esp32s3', buildId: 'f6899cb1067e5043' } });
    const service = makeService({ resolveElfFile });

    const result = await service.symbolicate(buildCoredumpFixture('f6899cb1067e5043'), { variant: 'eth' });

    expect(resolveElfFile).toHaveBeenCalledTimes(1);
    expect(resolveElfFile).toHaveBeenCalledWith({ buildId: 'f6899cb1067e5043' });
    expect(result.status).toBe('success');
    expect(result.buildId).toBe('f6899cb1067e5043');
  });

  it('fails with a message naming the build id when no ELF matches it (no variant fallback)', async () => {
    const resolveElfFile = jest.fn().mockReturnValue(null);
    const service = makeService({ resolveElfFile });

    const result = await service.symbolicate(buildCoredumpFixture('aaaabbbbccccdddd'), { variant: 'eth' });

    expect(resolveElfFile).toHaveBeenCalledTimes(1);
    expect(resolveElfFile).toHaveBeenCalledWith({ buildId: 'aaaabbbbccccdddd' });
    expect(result.status).toBe('failed');
    expect(result.backtrace).toContain('aaaabbbbccccdddd');
    expect(result.buildId).toBe('aaaabbbbccccdddd');
  });

  it('falls back to variant matching only when no build id can be extracted', async () => {
    const resolveElfFile = jest.fn().mockReturnValue(null);
    const service = makeService({ resolveElfFile });

    const result = await service.symbolicate(Buffer.from('no marker here'), { variant: 'eth' });

    expect(resolveElfFile).toHaveBeenCalledWith({ variant: 'eth' });
    expect(result.status).toBe('failed');
    expect(result.backtrace).toContain('No matching firmware ELF');
    expect(result.buildId).toBeNull();
  });

  it('prefers an explicitly provided build id over extraction', async () => {
    const resolveElfFile = jest.fn().mockReturnValue(null);
    const service = makeService({ resolveElfFile });

    const result = await service.symbolicate(buildCoredumpFixture('f6899cb1067e5043'), {
      variant: 'eth',
      buildId: '1111222233334444',
    });

    expect(resolveElfFile).toHaveBeenCalledWith({ buildId: '1111222233334444' });
    expect(result.buildId).toBe('1111222233334444');
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
