export type SymbolicationStatus = 'success' | 'failed' | 'skipped' | 'unavailable';

export interface SymbolicationResult {
  status: SymbolicationStatus;
  backtrace: string | null;
  buildId: string | null;
}
export const SYMBOLICATION_TIMEOUT_MS = 30000;
export const MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
export // ELF note name written by esp-idf's core dump component (esp_core_dump_elf.c).
// Its note payload contains the truncated app ELF SHA256 as a plain ASCII hex string.
const ESP_CORE_DUMP_INFO_MARKER = Buffer.from('ESP_CORE_DUMP_INFO', 'ascii');
export // Note payload: u32 version + zero-terminated ASCII sha. Scan a small window after the
// marker so we never pick up unrelated hex sequences elsewhere in the dump.
const BUILD_ID_SCAN_WINDOW_BYTES = 128;
export // esp-idf truncates the app ELF SHA256 to CONFIG_APP_RETRIEVE_LEN_ELF_SHA hex chars
// (Kconfig range 8..64; idf 5.x defaults to 9, older versions used 16).
const BUILD_ID_PATTERN = /[0-9a-fA-F]{8,64}/;
export const RISCV_CHIPS = new Set([
  'esp32c2',
  'esp32c3',
  'esp32c5',
  'esp32c6',
  'esp32c61',
  'esp32h2',
  'esp32h21',
  'esp32h4',
  'esp32p4',
]);
