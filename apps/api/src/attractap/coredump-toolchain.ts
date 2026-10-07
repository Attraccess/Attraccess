import { existsSync } from 'fs';
import { delimiter, join } from 'path';
import { RISCV_CHIPS } from './coredump-symbolication.service.feature-definitions';
import { CoredumpSymbolicationServiceRouteContext } from './coredump-symbolication.service.route-context';
export abstract class CoredumpToolchainImplementation extends CoredumpSymbolicationServiceRouteContext {
  protected resolveGdbPath(chip: string | null): string | null {
    if (process.env.ESP_COREDUMP_GDB) {
      return process.env.ESP_COREDUMP_GDB;
    }

    const normalizedChip = chip?.toLowerCase() ?? null;
    const isRiscv = normalizedChip ? RISCV_CHIPS.has(normalizedChip) : false;
    const archOverride = isRiscv ? process.env.ESP_COREDUMP_RISCV_GDB : process.env.ESP_COREDUMP_XTENSA_GDB;
    if (archOverride) {
      return archOverride;
    }

    // 'xtensa-esp-elf-gdb' is the unified multi-target name modern esp-idf installs.
    const candidates = isRiscv
      ? ['riscv32-esp-elf-gdb']
      : ['xtensa-esp-elf-gdb', 'xtensa-esp32-elf-gdb', 'xtensa-esp32s3-elf-gdb'];
    for (const candidate of candidates) {
      const resolved = this.findExecutableOnPath(candidate);
      if (resolved) {
        return resolved;
      }
    }

    return null;
  }

  protected findExecutableOnPath(command: string): string | null {
    if (command.includes('/')) {
      return existsSync(command) ? command : null;
    }

    for (const directory of (process.env.PATH || '').split(delimiter)) {
      if (!directory) {
        continue;
      }
      const candidate = join(directory, command);
      if (existsSync(candidate)) {
        return candidate;
      }
    }

    return null;
  }
}
