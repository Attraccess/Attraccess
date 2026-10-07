import { chmodSync, writeFileSync } from 'fs';
import { join } from 'path';
import { registerCoredumpSymbolicationServiceFixture } from './coredump-symbolication.service.coredump-symbolication-service.test-fixture';

export function registerReturnsUnavailableWhenEspCoredumpReportsAMissingGdbToolchainCases(
  fixture: ReturnType<typeof registerCoredumpSymbolicationServiceFixture>,
) {
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
}

export function registerReturnsUnavailableWhenTheEspCoredumpToolIsMissingCases(
  fixture: ReturnType<typeof registerCoredumpSymbolicationServiceFixture>,
) {
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
}
