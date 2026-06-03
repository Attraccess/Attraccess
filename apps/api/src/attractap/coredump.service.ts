import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { mkdtemp, writeFile, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { AttractapFirmwareService } from './firmware.service';
import { CoredumpFrameDto, CoredumpSymbolicationResultDto, CoredumpTaskDto } from './dtos/coredump.dto';

const execFileAsync = promisify(execFile);

export interface SymbolicateOptions {
  firmwareName?: string;
  variantName?: string;
}

export function extractBuildIdFromCoredump(coredump: Buffer): string | undefined {
  const text = coredump.toString('latin1');
  const marker = text.indexOf('ESP_CORE_DUMP_INFO');
  if (marker === -1) {
    return undefined;
  }
  const match = /[0-9a-f]{16}/.exec(text.slice(marker));
  return match ? match[0].toLowerCase() : undefined;
}

export function parseCoredumpInfo(rawText: string): Omit<CoredumpSymbolicationResultDto, 'firmwareName' | 'variantName' | 'matchedBy' | 'buildId'> {
  const crashed = /Crashed task handle:\s*(0x[0-9a-fA-F]+),\s*name:\s*'([^']*)'/.exec(rawText);
  const faultingTaskName = crashed?.[2] || undefined;
  const crashedTcb = crashed?.[1] || undefined;

  const panicMatch = /(abort\(\) was called[^\n]*|Guru Meditation Error[^\n]*|.*\bpanic'ed[^\n]*)/.exec(rawText);
  const panicReason = panicMatch?.[1]?.trim() || undefined;

  const coreMatch = /on core\s*(\d+)/.exec(rawText);
  const faultingCore = coreMatch ? Number(coreMatch[1]) : undefined;

  const backtrace: CoredumpFrameDto[] = [];
  const frameRegex = /^#(\d+)\s+(0x[0-9a-fA-F]+)\s+in\s+(\S+)(?:\s*\([^)]*\))?(?:\s+at\s+(.+?):(\d+))?/gm;
  let frame: RegExpExecArray | null;
  while ((frame = frameRegex.exec(rawText)) !== null) {
    backtrace.push({
      index: Number(frame[1]),
      pc: frame[2],
      function: frame[3],
      file: frame[4] || undefined,
      line: frame[5] ? Number(frame[5]) : undefined,
    });
  }

  const tasks: CoredumpTaskDto[] = [];
  const seen = new Set<string>();
  const taskRegex = /(?:name:\s*)?'([^']+)'(?:[^\n]*?TCB\s*[:=]?\s*(0x[0-9a-fA-F]+))?/g;
  let task: RegExpExecArray | null;
  while ((task = taskRegex.exec(rawText)) !== null) {
    const name = task[1];
    if (seen.has(name)) {
      continue;
    }
    seen.add(name);
    tasks.push({ name, tcb: task[2] || undefined, isCrashed: name === faultingTaskName });
  }

  if (faultingTaskName && !tasks.some((t) => t.name === faultingTaskName)) {
    tasks.unshift({ name: faultingTaskName, tcb: crashedTcb, isCrashed: true });
  }

  return { panicReason, faultingCore, faultingTaskName, backtrace, tasks, rawText };
}

@Injectable()
export class AttractapCoredumpService {
  private readonly logger = new Logger(AttractapCoredumpService.name);
  private readonly coredumpBin = process.env.ESP_COREDUMP_BIN || 'esp-coredump';

  public constructor(private readonly firmwareService: AttractapFirmwareService) {}

  public async symbolicate(coredump: Buffer, options: SymbolicateOptions): Promise<CoredumpSymbolicationResultDto> {
    if (!coredump || coredump.length === 0) {
      throw new BadRequestException('Empty coredump');
    }

    const buildId = extractBuildIdFromCoredump(coredump);
    const { firmwareName, variantName, matchedBy } = this.resolveFirmware(options, buildId);
    const elfPath = this.firmwareService.getElfPath(firmwareName, variantName);

    const workDir = await mkdtemp(join(tmpdir(), 'attractap-coredump-'));
    const coredumpPath = join(workDir, 'core.dump');

    try {
      await writeFile(coredumpPath, coredump);
      const rawText = await this.runEspCoredump(coredumpPath, elfPath);
      const parsed = parseCoredumpInfo(rawText);
      return { firmwareName, variantName, matchedBy, buildId, ...parsed };
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  private resolveFirmware(
    options: SymbolicateOptions,
    buildId: string | undefined,
  ): { firmwareName: string; variantName: string; matchedBy: 'buildId' | 'versionVariant' } {
    if (options.firmwareName && options.variantName) {
      return { firmwareName: options.firmwareName, variantName: options.variantName, matchedBy: 'versionVariant' };
    }

    if (buildId) {
      const match = this.firmwareService.findFirmwareByBuildId(buildId);
      if (match) {
        return { firmwareName: match.name, variantName: match.variant, matchedBy: 'buildId' };
      }
    }

    throw new NotFoundException(
      'Could not resolve a firmware ELF for this coredump. Provide firmwareName and variantName explicitly.',
    );
  }

  private async runEspCoredump(coredumpPath: string, elfPath: string): Promise<string> {
    const args = ['info_corefile', '--core', coredumpPath, '--core-format', 'elf', elfPath];
    try {
      const { stdout, stderr } = await execFileAsync(this.coredumpBin, args, { maxBuffer: 16 * 1024 * 1024 });
      return `${stdout}\n${stderr}`.trim();
    } catch (error) {
      const err = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string };
      if (err.code === 'ENOENT') {
        this.logger.error(`'${this.coredumpBin}' not found. Install esp-coredump (pip install esp-coredump).`);
        throw new BadRequestException(
          `Coredump tool '${this.coredumpBin}' is not installed on the server (set ESP_COREDUMP_BIN).`,
        );
      }
      if (err.stdout || err.stderr) {
        return `${err.stdout || ''}\n${err.stderr || ''}`.trim();
      }
      throw new BadRequestException(`Failed to symbolicate coredump: ${err.message}`);
    }
  }
}
