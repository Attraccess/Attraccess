import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'child_process';
import { mkdtemp, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { AttractapFirmwareService } from './firmware.service';

export type SymbolicationStatus = 'success' | 'failed' | 'skipped' | 'unavailable';

export interface SymbolicationResult {
  status: SymbolicationStatus;
  backtrace: string | null;
  buildId: string | null;
}

const SYMBOLICATION_TIMEOUT_MS = 30000;
const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;

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

    const elf = this.firmwareService.resolveElfFile({ buildId: options.buildId, variant: options.variant });
    if (!elf) {
      this.logger.warn(
        `No matching ELF for coredump (variant=${options.variant ?? 'n/a'}, buildId=${options.buildId ?? 'n/a'})`,
      );
      return {
        status: 'failed',
        backtrace: 'No matching firmware ELF was found on the server, so the coredump could not be symbolized.',
        buildId: options.buildId ?? null,
      };
    }

    const workingDir = await mkdtemp(join(tmpdir(), 'attractap-coredump-'));
    const corePath = join(workingDir, 'core.bin');

    try {
      await writeFile(corePath, coredump);
      const output = await this.runTool(elf.path, corePath, elf.firmware.chip);
      return {
        status: 'success',
        backtrace: output,
        buildId: elf.firmware.buildId ?? options.buildId ?? null,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (this.isToolMissing(message)) {
        this.logger.error(`esp-coredump tool not available: ${message}`);
        return { status: 'unavailable', backtrace: null, buildId: options.buildId ?? null };
      }
      this.logger.error(`Coredump symbolication failed: ${message}`);
      return { status: 'failed', backtrace: message, buildId: elf.firmware.buildId ?? options.buildId ?? null };
    } finally {
      await rm(workingDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private runTool(elfPath: string, corePath: string, chip: string | null): Promise<string> {
    const args = [
      ...(chip ? ['--chip', chip] : []),
      'info_corefile',
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
          if (!combined) {
            reject(error || new Error('esp-coredump produced no output'));
            return;
          }
          resolve(combined);
        },
      );
    });
  }

  private isToolMissing(message: string): boolean {
    return message.includes('ENOENT') || message.includes('not found');
  }
}
