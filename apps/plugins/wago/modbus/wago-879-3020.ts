import type { ModbusMeasurement } from './model';

// WAGO 4PU/4PS/2PU CT manual 082022 V1.6, appendix A3.2, pp. 34–38.
// Every documented non-reserved FC03 value. No writes or undocumented addresses.
const base = {
  addressBase: 0,
  byteOrder: 'big',
  wordOrder: 'big',
  offset: 0,
  pollIntervalMs: 5000,
  functionCode: 3,
  dataType: 'float32',
  decimalPlaces: 3,
} as const;
const field = (
  id: string,
  name: string,
  address: number,
  unit: ModbusMeasurement['unit'],
  section: ModbusMeasurement['section'],
  scale = 1,
  kind: ModbusMeasurement['kind'] = 'live',
): ModbusMeasurement => ({ ...base, id, name, address, unit, section, scale, kind });
const information = (
  id: string,
  name: string,
  address: number,
  dataType: ModbusMeasurement['dataType'] = 'uint16',
  extra: Partial<ModbusMeasurement> = {},
): ModbusMeasurement => ({ ...field(id, name, address, 'number', 'information'), dataType, ...extra });

export function wago8793020Measurements(): ModbusMeasurement[] {
  // Preserve the original five IDs, transforms and order for existing configurations.
  const original = [
    field('active-power', 'Active power', 0x5012, 'watt', 'electrical', 1000),
    field('import-energy', 'Imported energy', 0x600c, 'watt-hour', 'active-energy', 1000, 'cumulative'),
    field('export-energy', 'Exported energy', 0x6018, 'watt-hour', 'active-energy', 1000, 'cumulative'),
    field('voltage-l1', 'L1 voltage', 0x5002, 'volt', 'electrical'),
    field('current-l1', 'L1 current', 0x500c, 'ampere', 'electrical'),
  ];
  const metadata = [
    information('serial-number', 'Serial number', 0x4000, 'uint32', { display: 'hex' }),
    information('meter-code', 'Meter code', 0x4002, 'uint16', { display: 'hex' }),
    information('modbus-address', 'Modbus address', 0x4003),
    information('baud-rate-code', 'Baud rate code', 0x4004, 'uint16', {
      valueLabels: {
        1: '300 baud',
        2: '600 baud',
        3: '1200 baud',
        4: '2400 baud',
        5: '4800 baud',
        6: '9600 baud',
        7: '19200 baud',
        8: '38400 baud',
        9: '57600 baud',
        10: '115200 baud',
      },
    }),
    information('protocol-version', 'Protocol version', 0x4005, 'float32'),
    information('software-version', 'Software version', 0x4007, 'float32'),
    information('hardware-version', 'Hardware version', 0x4009, 'float32'),
    information('meter-rated-current', 'Meter rated current', 0x400b, 'int16', { unit: 'ampere' }),
    information('ct-ratio-code', 'CT ratio code', 0x400c, 'uint16', { display: 'hex' }),
    information('s0-pulse-rate', 'S0 pulse rate', 0x400d, 'float32', { unit: 'pulse-per-kilowatt-hour' }),
    information('energy-combination-code', 'Energy combination code', 0x400f, 'int16', {
      valueLabels: {
        1: 'Import only',
        2: 'Export only',
        3: 'Import + export',
        4: 'Import − export',
        5: 'Import − export (10)',
      },
    }),
    information('lcd-rolling-time', 'LCD rolling time', 0x4010, 'uint16', { unit: 'second', encoding: 'bcd' }),
    information('parity-code', 'Parity code', 0x4011, 'int16', { valueLabels: { 1: 'Even', 2: 'None', 3: 'Odd' } }),
    ...[1, 2, 3].map((phase) =>
      information(`current-direction-l${phase}`, `L${phase} current direction`, 0x4011 + phase, 'uint16', {
        display: 'ascii',
        valueLabels: { 70: 'Import (F)', 82: 'Export (R)' },
      }),
    ),
    information('power-down-count', 'Power-down counter', 0x4016, 'int16'),
    information('current-quadrant', 'Current quadrant', 0x4017, 'int16'),
    ...[1, 2, 3].map((phase) => information(`quadrant-l${phase}`, `L${phase} quadrant`, 0x4017 + phase, 'int16')),
    information('checksum', 'Checksum', 0x401b, 'uint32', { display: 'hex' }),
    information('active-status', 'Active status word', 0x401d, 'uint32', { display: 'hex' }),
    information('ct-ratio', 'CT ratio (packed)', 0x401f, 'uint32', { display: 'hex' }),
    // A3.2 says two words, overlapping pulse type. A3.3 specifies one
    // FC06 word at 4021; do not include the unrelated 4022 setting.
    information('s0-pulse-width', 'S0 pulse width', 0x4021, 'uint16', {
      unit: 'second',
      scale: 0.001,
      encoding: 'bcd',
    }),
    information('s0-pulse-type', 'S0 pulse type', 0x4022, 'uint16', {
      valueLabels: { 1: 'Active and reactive energy', 2: 'Import and export' },
    }),
    information('checksum-2', 'Checksum 2', 0x4023, 'uint32', { display: 'hex' }),
    information('data-format', 'Data format', 0x4026, 'int16', { valueLabels: { 1: 'Standard float', 2: 'Integer' } }),
    information('screen-direction', 'Screen direction', 0x4032, 'int16', {
      valueLabels: { 0: 'Standard', 1: 'Rotated 180°' },
    }),
    information('obis-display', 'OBIS display', 0x4033, 'int16', { valueLabels: { 0: 'Off', 1: 'On' } }),
  ];
  const electrical = [
    field('voltage', 'Voltage', 0x5000, 'volt', 'electrical'),
    ...[1, 2, 3].map((p) => field(`voltage-l${p}`, `L${p} voltage`, 0x5000 + 2 * p, 'volt', 'electrical')),
    field('frequency', 'Frequency', 0x5008, 'hertz', 'electrical'),
    field('current', 'Current', 0x500a, 'ampere', 'electrical'),
    ...[1, 2, 3].map((p) => field(`current-l${p}`, `L${p} current`, 0x500a + 2 * p, 'ampere', 'electrical')),
    ...(
      [
        ['active-power', 'Active power', 0x5012, 'watt', 1000],
        ['reactive-power', 'Reactive power', 0x501a, 'var', 1000],
        ['apparent-power', 'Apparent power', 0x5022, 'volt-ampere', 1000],
        ['power-factor', 'Power factor', 0x502a, 'ratio', 1],
      ] as const
    ).flatMap(([id, name, address, unit, scale]) => [
      field(id, `Total ${name.toLowerCase()}`, address, unit, 'electrical', scale),
      ...[1, 2, 3].map((p) =>
        field(`${id}-l${p}`, `L${p} ${name.toLowerCase()}`, address + 2 * p, unit, 'electrical', scale),
      ),
    ]),
    ...(
      [
        ['l1-l2', 0x5032],
        ['l1-l3', 0x5034],
        ['l2-l3', 0x5036],
      ] as const
    ).map(([phases, address]) =>
      field(`voltage-${phases}`, `${phases.toUpperCase().replace('-', '–')} voltage`, address, 'volt', 'electrical'),
    ),
  ];
  const energy = (
    [
      ['active-energy', 'Total active energy', 0x6000, 'watt-hour', 'active-energy', 'live'],
      ['import-energy', 'Imported energy', 0x600c, 'watt-hour', 'active-energy', 'cumulative'],
      ['export-energy', 'Exported energy', 0x6018, 'watt-hour', 'active-energy', 'cumulative'],
      ['reactive-energy', 'Total reactive energy', 0x6024, 'var-hour', 'reactive-energy', 'live'],
      ['import-reactive-energy', 'Imported reactive energy', 0x6030, 'var-hour', 'reactive-energy', 'cumulative'],
      ['export-reactive-energy', 'Exported reactive energy', 0x603c, 'var-hour', 'reactive-energy', 'cumulative'],
    ] as const
  ).flatMap(([id, name, address, unit, section, kind]) => [
    field(id, name, address, unit, section, 1000, kind),
    ...[1, 2].map((t) => field(`${id}-t${t}`, `${name} T${t}`, address + 2 * t, unit, section, 1000, kind)),
    ...[1, 2, 3].map((p) => field(`${id}-l${p}`, `${name} L${p}`, address + 4 + 2 * p, unit, section, 1000, kind)),
  ]);
  const extraEnergy = [
    {
      ...field('tariff', 'Active tariff', 0x6048, 'number', 'information'),
      dataType: 'int16' as const,
      valueLabels: { 1: 'T1', 2: 'T2', 3: 'T3', 4: 'T4' },
    },
    field('day-energy', 'Resettable day energy', 0x6049, 'watt-hour', 'active-energy', 1000),
    ...(
      [
        ['active-energy', 'Total active energy', 0x604b, 'watt-hour', 'active-energy', 'live'],
        ['import-energy', 'Imported energy', 0x604f, 'watt-hour', 'active-energy', 'cumulative'],
        ['export-energy', 'Exported energy', 0x6053, 'watt-hour', 'active-energy', 'cumulative'],
        ['reactive-energy', 'Total reactive energy', 0x6057, 'var-hour', 'reactive-energy', 'live'],
        ['import-reactive-energy', 'Imported reactive energy', 0x605b, 'var-hour', 'reactive-energy', 'cumulative'],
        ['export-reactive-energy', 'Exported reactive energy', 0x605f, 'var-hour', 'reactive-energy', 'cumulative'],
      ] as const
    ).flatMap(([id, name, address, unit, section, kind]) =>
      [3, 4].map((t) => field(`${id}-t${t}`, `${name} T${t}`, address + 2 * (t - 3), unit, section, 1000, kind)),
    ),
    ...(
      [
        ['import-inductive-energy-q1', 'Imported inductive energy Q1', 0x6063],
        ['import-capacitive-energy-q2', 'Imported capacitive energy Q2', 0x606d],
        ['export-inductive-energy-q3', 'Exported inductive energy Q3', 0x6077],
        ['export-capacitive-energy-q4', 'Exported capacitive energy Q4', 0x6081],
      ] as const
    ).flatMap(([id, name, address]) => [
      field(id, name, address, 'var-hour', 'quadrant-energy', 1000, 'cumulative'),
      ...[1, 2, 3, 4].map((t) =>
        field(`${id}-t${t}`, `${name} T${t}`, address + 2 * t, 'var-hour', 'quadrant-energy', 1000, 'cumulative'),
      ),
    ]),
    ...[1, 2, 3].map((p) =>
      field(`day-energy-l${p}`, `Resettable day energy L${p}`, 0x6089 + 2 * p, 'watt-hour', 'active-energy', 1000),
    ),
  ];
  const oldAddresses = new Set(original.map((m) => m.address));
  return [...original, ...electrical, ...energy, ...extraEnergy, ...metadata].filter(
    (m, i) => i < original.length || !oldAddresses.has(m.address),
  );
}
