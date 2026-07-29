import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'child_process';
import { existsSync } from 'fs';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { delimiter, join } from 'path';
import { AttractapFirmwareService } from './firmware.service';

export type SymbolicationStatus = 'success' | 'failed' | 'skipped' | 'unavailable';

export interface SymbolicationResult {
  status: SymbolicationStatus;
  backtrace: string | null;
  buildId: string | null;
}

const SYMBOLICATION_TIMEOUT_MS = 30000;
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;

// ELF note name written by esp-idf's core dump component (esp_core_dump_elf.c).
// Its note payload contains the truncated app ELF SHA256 as a plain ASCII hex string.
const ESP_CORE_DUMP_INFO_MARKER = Buffer.from('ESP_CORE_DUMP_INFO', 'ascii');
// Note payload: u32 version + zero-terminated ASCII sha. Scan a small window after the
// marker so we never pick up unrelated hex sequences elsewhere in the dump.
const BUILD_ID_SCAN_WINDOW_BYTES = 128;
// esp-idf truncates the app ELF SHA256 to CONFIG_APP_RETRIEVE_LEN_ELF_SHA hex chars
// (Kconfig range 8..64; idf 5.x defaults to 9, older versions used 16).
const BUILD_ID_PATTERN = /[0-9a-fA-F]{8,64}/;
const RISCV_CHIPS = new Set(['esp32c2', 'esp32c3', 'esp32c5', 'esp32c6', 'esp32c61', 'esp32h2', 'esp32h21', 'esp32h4', 'esp32p4']);

@Injectable()
export class CoredumpSymbolicationService {
  private readonly logger = new Logger(CoredumpSymbolicationService.name);
  private readonly toolCommand = process.env.ESP_COREDUMP_CMD || 'esp-coredump';

  public constructor(private readonly firmwareService: AttractapFirmwareService) {}

  public async symbolicate(
    coredump: Buffer | null,
    options: { variant?: string | null; buildId?: string | null },
  ): Promise<SymbolicationResult> {
    if (!coredump || coredump.length === 0) {
      return { status: 'skipped', backtrace: null, buildId: options.buildId ?? null };
    }

    const buildId = options.buildId ?? this.extractBuildId(coredump);

    let elf: ReturnType<AttractapFirmwareService['resolveElfFile']> = null;
    if (buildId) {
      // Strict match on the build id embedded in the coredump. A variant-matched ELF for a
      // different build would only produce esp-coredump's misleading SHA-mismatch failure.
      elf = this.firmwareService.resolveElfFile({ buildId });
      if (!elf) {
        this.logger.warn(`No firmware ELF matching coredump build id ${buildId} (variant=${options.variant ?? 'n/a'})`);
        return {
          status: 'failed',
          backtrace: `No firmware ELF matching coredump build id ${buildId} was found on the server, so the coredump could not be symbolized. The reader is likely running a build that was never published with an ELF (e.g. a local development build).`,
          buildId,
        };
      }
    } else {
      // Last resort: the dump is too truncated/corrupted to carry a build id, so try the
      // server's ELF for the reader's variant. esp-coredump will still verify the SHA itself.
      this.logger.warn(
        `Could not extract build id from coredump; falling back to variant match (variant=${options.variant ?? 'n/a'})`,
      );
      elf = this.firmwareService.resolveElfFile({ variant: options.variant });
      if (!elf) {
        return {
          status: 'failed',
          backtrace: 'No matching firmware ELF was found on the server, so the coredump could not be symbolized.',
          buildId: null,
        };
      }
    }

    const workingDir = await mkdtemp(join(tmpdir(), 'attractap-coredump-'));
    const corePath = join(workingDir, 'core.bin');

    try {
      await writeFile(corePath, coredump);
      const output = await this.runTool(elf.path, corePath, elf.firmware.chip);
      return {
        status: 'success',
        backtrace: output,
        // esp-coredump verified the ELF's SHA against the dump, so the ELF's (full) build id
        // is the coredump's build id — even when the ELF was resolved via variant fallback.
        buildId: elf.firmware.buildId ?? buildId ?? null,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (this.isToolMissing(message) || this.isToolchainMissing(message)) {
        this.logger.error(`esp-coredump tool not available: ${message}`);
        return { status: 'unavailable', backtrace: null, buildId: buildId ?? null };
      }
      this.logger.error(`Coredump symbolication failed: ${message}`);
      // Unverified: only report a build id that actually came from the coredump, not the
      // metadata of an ELF that esp-coredump may have just rejected.
      return { status: 'failed', backtrace: message, buildId: buildId ?? null };
    } finally {
      await rm(workingDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  /**
   * Extracts the truncated app ELF SHA256 ("build id") from a raw ESP32 coredump.
   *
   * The flash-format coredump (20-byte header + inner ELF) contains an ELF note named
   * ESP_CORE_DUMP_INFO whose payload is a u32 version followed by the truncated app ELF
   * SHA256 as a zero-terminated ASCII hex string (CONFIG_APP_RETRIEVE_LEN_ELF_SHA chars,
   * 16 by default). We locate the note name and scan a small window after it.
   */
  public extractBuildId(coredump: Buffer): string | null {
    const markerIndex = coredump.indexOf(ESP_CORE_DUMP_INFO_MARKER);
    if (markerIndex === -1) {
      return null;
    }

    const windowStart = markerIndex + ESP_CORE_DUMP_INFO_MARKER.length;
    const window = coredump.subarray(windowStart, windowStart + BUILD_ID_SCAN_WINDOW_BYTES).toString('latin1');

    const match = window.match(BUILD_ID_PATTERN);
    return match ? match[0].toLowerCase() : null;
  }

  private runTool(elfPath: string, corePath: string, chip: string | null): Promise<string> {
    const gdbPath = this.resolveGdbPath(chip);
    const args = [
      ...(chip ? ['--chip', chip] : []),
      'info_corefile',
      ...(gdbPath ? ['--gdb', gdbPath] : []),
      '--core',
      corePath,
      '--core-format',
      'raw',
      elfPath,
    ];

    return new Promise((resolve, reject) => {
      execFile(
        this.toolCommand,
        args,
        { timeout: SYMBOLICATION_TIMEOUT_MS, maxBuffer: MAX_OUTPUT_BYTES, windowsHide: true },
        (error, stdout, stderr) => {
          const combined = `${stdout || ''}${stderr ? `\n${stderr}` : ''}`.trim();
          if (error && this.isToolMissing(error.message)) {
            reject(error);
            return;
          }
          if (error || this.isToolchainMissing(combined)) {
            reject(new Error(combined || error?.message || 'esp-coredump failed'));
            return;
          }
          if (!combined) {
            reject(error || new Error('esp-coredump produced no output'));
            return;
          }
          resolve(combined);
        },
      );
    });
  }

  private resolveGdbPath(chip: string | null): string | null {
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

  private findExecutableOnPath(command: string): string | null {
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

  private isToolMissing(message: string): boolean {
    return message.includes('ENOENT') || message.includes('not found');
  }

  private isToolchainMissing(message: string): boolean {
    return message.includes('GDB executable not found') || message.includes('Please install GDB');
  }
}
