import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { CoredumpSymbolicationService } from './coredump-symbolication.service';
import { AttractapFirmwareService } from './firmware.service';

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
export function registerCoredumpSymbolicationServiceFixture() {
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
  return {
    get makeService() {
      return makeService;
    },
    get buildCoredumpFixture() {
      return buildCoredumpFixture;
    },
    get tempDir() {
      return tempDir;
    },
  };
}
