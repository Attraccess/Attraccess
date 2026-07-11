import { CoredumpSymbolicationService } from './coredump-symbolication.service';
import { AttractapFirmwareService } from './firmware.service';
import { mkdtempSync, writeFileSync, chmodSync, rmSync, readFileSync } from 'fs';
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
  const originalPath = process.env.PATH;
  const originalGdb = process.env.ESP_COREDUMP_GDB;
  const originalXtensaGdb = process.env.ESP_COREDUMP_XTENSA_GDB;
  const originalRiscvGdb = process.env.ESP_COREDUMP_RISCV_GDB;

  function tempDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'symbolication-test-'));
    tempDirs.push(dir);
    return dir;
  }

  beforeEach(() => {
    // Nx loads the workspace .env into test runs; ambient tool overrides must
    // not leak into tests that build their own fake tools on PATH.
    delete process.env.ESP_COREDUMP_CMD;
    delete process.env.ESP_COREDUMP_GDB;
    delete process.env.ESP_COREDUMP_XTENSA_GDB;
    delete process.env.ESP_COREDUMP_RISCV_GDB;
  });

  afterEach(() => {
    if (originalCmd === undefined) {
      delete process.env.ESP_COREDUMP_CMD;
    } else {
      process.env.ESP_COREDUMP_CMD = originalCmd;
    }
    if (originalPath === undefined) {
      delete process.env.PATH;
    } else {
      process.env.PATH = originalPath;
    }
    if (originalGdb === undefined) {
      delete process.env.ESP_COREDUMP_GDB;
    } else {
      process.env.ESP_COREDUMP_GDB = originalGdb;
    }
    if (originalXtensaGdb === undefined) {
      delete process.env.ESP_COREDUMP_XTENSA_GDB;
    } else {
      process.env.ESP_COREDUMP_XTENSA_GDB = originalXtensaGdb;
    }
    if (originalRiscvGdb === undefined) {
      delete process.env.ESP_COREDUMP_RISCV_GDB;
    } else {
      process.env.ESP_COREDUMP_RISCV_GDB = originalRiscvGdb;
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

    it('extracts idf 5.x default-length (9 hex chars) build ids', () => {
      const service = makeService({});
      expect(service.extractBuildId(buildCoredumpFixture('557a61f6f'))).toBe('557a61f6f');
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

  it('does not report the fallback ELF metadata build id when symbolication fails', async () => {
    const binDir = tempDir();
    const fakeTool = join(binDir, 'fake-esp-coredump');
    // Produces no output, so runTool rejects and symbolication is reported as failed
    writeFileSync(fakeTool, '#!/bin/sh\nexit 1\n');
    chmodSync(fakeTool, 0o755);
    process.env.ESP_COREDUMP_CMD = fakeTool;

    const elfPath = join(binDir, 'fw.elf');
    writeFileSync(elfPath, 'elf');
    const service = makeService({
      resolveElfFile: jest
        .fn()
        .mockReturnValue({ path: elfPath, firmware: { chip: 'esp32s3', buildId: 'f6899cb1067e5043' } }),
    });

    // No extractable build id → variant fallback → tool failure must not surface the ELF's build id
    const result = await service.symbolicate(Buffer.from('no marker here'), { variant: 'eth' });
    expect(result.status).toBe('failed');
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

  it('returns unavailable when esp-coredump reports a missing GDB toolchain', async () => {
    const binDir = tempDir();
    const fakeTool = join(binDir, 'fake-esp-coredump');
    writeFileSync(fakeTool, '#!/bin/sh\necho "GDB executable not found. Please install GDB."\nexit 0\n');
    chmodSync(fakeTool, 0o755);
    process.env.ESP_COREDUMP_CMD = fakeTool;

    const elfPath = join(binDir, 'fw.elf');
    writeFileSync(elfPath, 'elf');
    const service = makeService({
      resolveElfFile: jest.fn().mockReturnValue({ path: elfPath, firmware: { chip: 'esp32s3', buildId: 'abc' } }),
    });

    const result = await service.symbolicate(Buffer.from('core'), { variant: 'eth', buildId: null });

    expect(result.status).toBe('unavailable');
    expect(result.backtrace).toBeNull();
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

  it('passes an explicitly resolved GDB path to esp-coredump for Xtensa chips', async () => {
    const binDir = tempDir();
    const argsFile = join(binDir, 'args.txt');
    const fakeTool = join(binDir, 'fake-esp-coredump');
    const fakeGdb = join(binDir, 'xtensa-esp32s3-elf-gdb');
    writeFileSync(fakeTool, `#!/bin/sh\nprintf '%s\\n' "$@" > "${argsFile}"\necho "#0 0x42066718 in ApplicationLoop::tick()"\n`);
    writeFileSync(fakeGdb, '#!/bin/sh\nexit 0\n');
    chmodSync(fakeTool, 0o755);
    chmodSync(fakeGdb, 0o755);
    process.env.ESP_COREDUMP_CMD = fakeTool;
    process.env.PATH = `${binDir}${process.env.PATH ? `:${process.env.PATH}` : ''}`;

    const elfPath = join(binDir, 'fw.elf');
    writeFileSync(elfPath, 'elf');
    const service = makeService({
      resolveElfFile: jest
        .fn()
        .mockReturnValue({ path: elfPath, firmware: { chip: 'esp32s3', buildId: 'f6899cb1067e5043' } }),
    });

    const result = await service.symbolicate(Buffer.from('core'), { variant: 'eth', buildId: null });
    const args = readFileSync(argsFile, 'utf8').trim().split('\n');

    expect(result.status).toBe('success');
    expect(args).toEqual(
      expect.arrayContaining(['--chip', 'esp32s3', 'info_corefile', '--gdb', fakeGdb, '--core-format', 'raw']),
    );
  });
});
