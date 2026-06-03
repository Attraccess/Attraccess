import { extractBuildIdFromCoredump, parseCoredumpInfo } from './coredump.service';

describe('extractBuildIdFromCoredump', () => {
  it('reads the build id following the ESP_CORE_DUMP_INFO marker', () => {
    const buffer = Buffer.concat([
      Buffer.from('garbage'),
      Buffer.from('ESP_CORE_DUMP_INFO\0'),
      Buffer.from([0x45, 0x00, 0x01, 0x09, 0x00]),
      Buffer.from('f6899cb1067e5043'),
      Buffer.from('\0\0\0'),
    ]);

    expect(extractBuildIdFromCoredump(buffer)).toBe('f6899cb1067e5043');
  });

  it('returns undefined when the marker is absent', () => {
    expect(extractBuildIdFromCoredump(Buffer.from('no marker here'))).toBeUndefined();
  });
});

describe('parseCoredumpInfo', () => {
  const sample = [
    '==================== ESP32 CORE DUMP START ====================',
    "Crashed task handle: 0x3fcf4a08, name: 'websocket_task', GDB name: 'process 1'",
    'abort() was called at PC 0x42066718 on core 0',
    '==================== CURRENT THREAD STACK =====================',
    '#0  0x42066718 in panic_abort (details=0x3fcf1234) at /idf/components/esp_system/panic.c:408',
    '#1  0x42065cb5 in esp_system_abort at /idf/components/esp_system/esp_system.c:137',
    '==================== THREADS INFO =====================',
    "  2    process 2  0x40081234 in vPortIdle 'IDLE0'",
    "  3    process 3  0x40081240 in xTask 'NetworkTask'",
  ].join('\n');

  it('extracts the faulting task, core, panic reason and backtrace', () => {
    const result = parseCoredumpInfo(sample);

    expect(result.faultingTaskName).toBe('websocket_task');
    expect(result.faultingCore).toBe(0);
    expect(result.panicReason).toBe('abort() was called at PC 0x42066718 on core 0');
    expect(result.backtrace).toHaveLength(2);
    expect(result.backtrace[0]).toEqual({
      index: 0,
      pc: '0x42066718',
      function: 'panic_abort',
      file: '/idf/components/esp_system/panic.c',
      line: 408,
    });
    expect(result.backtrace[1].function).toBe('esp_system_abort');
  });

  it('lists tasks and flags the crashed one', () => {
    const result = parseCoredumpInfo(sample);
    const names = result.tasks.map((t) => t.name);

    expect(names).toContain('websocket_task');
    expect(names).toContain('IDLE0');
    expect(names).toContain('NetworkTask');
    expect(result.tasks.find((t) => t.name === 'websocket_task')?.isCrashed).toBe(true);
    expect(result.tasks.find((t) => t.name === 'IDLE0')?.isCrashed).toBe(false);
  });
});
