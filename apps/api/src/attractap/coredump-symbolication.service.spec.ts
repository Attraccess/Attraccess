import { registerCoredumpSymbolicationServiceFixture } from './coredump-symbolication.service.coredump-symbolication-service.test-fixture';
import { chmodSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';

describe('CoredumpSymbolicationService', () => {
  const fixture = registerCoredumpSymbolicationServiceFixture();

  it('returns skipped when there is no coredump', async () => {
    const service = fixture.makeService({ resolveElfFile: jest.fn() });
    const result = await service.symbolicate(null, { variant: 'eth', buildId: null });
    expect(result.status).toBe('skipped');
    expect(result.backtrace).toBeNull();
  });

  it('returns failed when no matching ELF is found', async () => {
    const service = fixture.makeService({ resolveElfFile: jest.fn().mockReturnValue(null) });
    const result = await service.symbolicate(Buffer.from('core'), { variant: 'eth', buildId: null });
    expect(result.status).toBe('failed');
    expect(result.backtrace).toContain('No matching firmware ELF');
  });

  describe('extractBuildId', () => {
    it('extracts the truncated app ELF SHA256 from a coredump', () => {
      const service = fixture.makeService({});
      expect(service.extractBuildId(fixture.buildCoredumpFixture('f6899cb1067e5043'))).toBe('f6899cb1067e5043');
    });

    it('extracts idf 5.x default-length (9 hex chars) build ids', () => {
      const service = fixture.makeService({});
      expect(service.extractBuildId(fixture.buildCoredumpFixture('557a61f6f'))).toBe('557a61f6f');
    });

    it('normalizes the build id to lowercase', () => {
      const service = fixture.makeService({});
      expect(service.extractBuildId(fixture.buildCoredumpFixture('F6899CB1067E5043'))).toBe('f6899cb1067e5043');
    });

    it('returns null when the coredump has no ESP_CORE_DUMP_INFO note', () => {
      const service = fixture.makeService({});
      expect(service.extractBuildId(Buffer.alloc(256, 0xa5))).toBeNull();
    });

    it('returns null when the note carries no sha (truncated dump)', () => {
      const service = fixture.makeService({});
      expect(service.extractBuildId(fixture.buildCoredumpFixture(null))).toBeNull();
    });
  });

  it('extracts the build id from the coredump and resolves the ELF strictly by it', async () => {
    const binDir = fixture.tempDir();
    const fakeTool = join(binDir, 'fake-esp-coredump');
    writeFileSync(fakeTool, '#!/bin/sh\necho "#0 0x42066718 in ApplicationLoop::tick() at main.cpp:212"\n');
    chmodSync(fakeTool, 0o755);
    process.env.ESP_COREDUMP_CMD = fakeTool;

    const elfPath = join(binDir, 'fw.elf');
    writeFileSync(elfPath, 'elf');
    const resolveElfFile = jest
      .fn()
      .mockReturnValue({ path: elfPath, firmware: { chip: 'esp32s3', buildId: 'f6899cb1067e5043' } });
    const service = fixture.makeService({ resolveElfFile });

    const result = await service.symbolicate(fixture.buildCoredumpFixture('f6899cb1067e5043'), { variant: 'eth' });

    expect(resolveElfFile).toHaveBeenCalledTimes(1);
    expect(resolveElfFile).toHaveBeenCalledWith({ buildId: 'f6899cb1067e5043' });
    expect(result.status).toBe('success');
    expect(result.buildId).toBe('f6899cb1067e5043');
  });

  it('fails with a message naming the build id when no ELF matches it (no variant fallback)', async () => {
    const resolveElfFile = jest.fn().mockReturnValue(null);
    const service = fixture.makeService({ resolveElfFile });

    const result = await service.symbolicate(fixture.buildCoredumpFixture('aaaabbbbccccdddd'), { variant: 'eth' });

    expect(resolveElfFile).toHaveBeenCalledTimes(1);
    expect(resolveElfFile).toHaveBeenCalledWith({ buildId: 'aaaabbbbccccdddd' });
    expect(result.status).toBe('failed');
    expect(result.backtrace).toContain('aaaabbbbccccdddd');
    expect(result.buildId).toBe('aaaabbbbccccdddd');
  });

  it('falls back to variant matching only when no build id can be extracted', async () => {
    const resolveElfFile = jest.fn().mockReturnValue(null);
    const service = fixture.makeService({ resolveElfFile });

    const result = await service.symbolicate(Buffer.from('no marker here'), { variant: 'eth' });

    expect(resolveElfFile).toHaveBeenCalledWith({ variant: 'eth' });
    expect(result.status).toBe('failed');
    expect(result.backtrace).toContain('No matching firmware ELF');
    expect(result.buildId).toBeNull();
  });

  it('does not report the fallback ELF metadata build id when symbolication fails', async () => {
    const binDir = fixture.tempDir();
    const fakeTool = join(binDir, 'fake-esp-coredump');
    // Produces no output, so runTool rejects and symbolication is reported as failed
    writeFileSync(fakeTool, '#!/bin/sh\nexit 1\n');
    chmodSync(fakeTool, 0o755);
    process.env.ESP_COREDUMP_CMD = fakeTool;

    const elfPath = join(binDir, 'fw.elf');
    writeFileSync(elfPath, 'elf');
    const service = fixture.makeService({
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
    const service = fixture.makeService({ resolveElfFile });

    const result = await service.symbolicate(fixture.buildCoredumpFixture('f6899cb1067e5043'), {
      variant: 'eth',
      buildId: '1111222233334444',
    });

    expect(resolveElfFile).toHaveBeenCalledWith({ buildId: '1111222233334444' });
    expect(result.buildId).toBe('1111222233334444');
  });

  it('returns unavailable when the esp-coredump tool is missing', async () => {
    process.env.ESP_COREDUMP_CMD = join(fixture.tempDir(), 'does-not-exist-esp-coredump');
    const elfDir = fixture.tempDir();
    const elfPath = join(elfDir, 'fw.elf');
    writeFileSync(elfPath, 'elf');
    const service = fixture.makeService({
      resolveElfFile: jest.fn().mockReturnValue({ path: elfPath, firmware: { chip: 'esp32s3', buildId: 'abc' } }),
    });
    const result = await service.symbolicate(Buffer.from('core'), { variant: 'eth', buildId: null });
    expect(result.status).toBe('unavailable');
  });

  it('returns unavailable when esp-coredump reports a missing GDB toolchain', async () => {
    const binDir = fixture.tempDir();
    const fakeTool = join(binDir, 'fake-esp-coredump');
    writeFileSync(fakeTool, '#!/bin/sh\necho "GDB executable not found. Please install GDB."\nexit 0\n');
    chmodSync(fakeTool, 0o755);
    process.env.ESP_COREDUMP_CMD = fakeTool;

    const elfPath = join(binDir, 'fw.elf');
    writeFileSync(elfPath, 'elf');
    const service = fixture.makeService({
      resolveElfFile: jest.fn().mockReturnValue({ path: elfPath, firmware: { chip: 'esp32s3', buildId: 'abc' } }),
    });

    const result = await service.symbolicate(Buffer.from('core'), { variant: 'eth', buildId: null });

    expect(result.status).toBe('unavailable');
    expect(result.backtrace).toBeNull();
  });

  it('returns success and the tool output when symbolication succeeds', async () => {
    const binDir = fixture.tempDir();
    const fakeTool = join(binDir, 'fake-esp-coredump');
    writeFileSync(fakeTool, '#!/bin/sh\necho "#0 0x42066718 in ApplicationLoop::tick() at main.cpp:212"\n');
    chmodSync(fakeTool, 0o755);
    process.env.ESP_COREDUMP_CMD = fakeTool;

    const elfPath = join(binDir, 'fw.elf');
    writeFileSync(elfPath, 'elf');
    const service = fixture.makeService({
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
    const binDir = fixture.tempDir();
    const argsFile = join(binDir, 'args.txt');
    const fakeTool = join(binDir, 'fake-esp-coredump');
    const fakeGdb = join(binDir, 'xtensa-esp32s3-elf-gdb');
    writeFileSync(
      fakeTool,
      `#!/bin/sh\nprintf '%s\\n' "$@" > "${argsFile}"\necho "#0 0x42066718 in ApplicationLoop::tick()"\n`,
    );
    writeFileSync(fakeGdb, '#!/bin/sh\nexit 0\n');
    chmodSync(fakeTool, 0o755);
    chmodSync(fakeGdb, 0o755);
    process.env.ESP_COREDUMP_CMD = fakeTool;
    process.env.ESP_COREDUMP_XTENSA_GDB = fakeGdb;
    process.env.PATH = `${binDir}${process.env.PATH ? `:${process.env.PATH}` : ''}`;

    const elfPath = join(binDir, 'fw.elf');
    writeFileSync(elfPath, 'elf');
    const service = fixture.makeService({
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
