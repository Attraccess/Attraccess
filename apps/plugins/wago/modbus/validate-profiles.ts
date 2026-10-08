import { ENGINEERING_UNITS } from '../measurement-contract';
import { BUILTIN_MODBUS_PROFILES } from './model';
import { ModbusConfiguration } from './model-contracts';
import { ModbusMeasurement } from './model-contracts';
import { registerCount } from './model';
import { RegisterFormat } from './model-contracts';
import { ModbusValidation } from './validation-context';
export function validateProfiles(config: ModbusConfiguration, validation: ModbusValidation): void {
  const { fail, object, integer, name, keys } = validation;
  const format = (f: RegisterFormat, path: string) => {
    if (
      ![0, 1].includes(f.addressBase) ||
      !Number.isSafeInteger(f.address) ||
      !integer(f.address - f.addressBase, 0, 65536 - registerCount(f)) ||
      !['uint16', 'int16', 'uint32', 'int32', 'float32'].includes(f.dataType) ||
      !['big', 'little'].includes(f.byteOrder) ||
      !['big', 'little'].includes(f.wordOrder) ||
      !Number.isFinite(f.scale) ||
      f.scale === 0 ||
      !Number.isFinite(f.offset)
    )
      fail(path, 'invalid address, dtype, order or transform');
  };
  config.profiles.forEach((p, i) => {
    const path = `modbus.profiles[${i}]`;
    keys(p, ['id', 'name', 'version', 'measurements', 'actions'], path);
    if (BUILTIN_MODBUS_PROFILES.some((b) => b.id === p.id) || !name(p.name) || !integer(p.version, 1, 1000000))
      fail(path, 'custom ID, name and positive version required; built-ins are immutable');
    if (!Array.isArray(p.measurements) || !Array.isArray(p.actions) || p.measurements.length + p.actions.length > 256) {
      fail(path, 'measurements/actions arrays required, maximum 256 entries');
      return;
    }
    const ids = new Set<string>();
    [...p.measurements, ...p.actions].forEach((f, j) => {
      if (!object(f) || !name(f.id) || !name(f.name) || ids.has(f.id)) {
        fail(`${path}[${j}]`, 'unique named entry required');
        return;
      }
      ids.add(f.id);
      format(f, `${path}.${f.id}`);
      keys(
        f,
        [
          'id',
          'name',
          'address',
          'addressBase',
          'dataType',
          'byteOrder',
          'wordOrder',
          'scale',
          'offset',
          'functionCode',
          ...(p.measurements.includes(f as ModbusMeasurement)
            ? [
                'unit',
                'kind',
                'pollIntervalMs',
                'rollover',
                'decimalPlaces',
                'encoding',
                'section',
                'display',
                'valueLabels',
              ]
            : ['onValue', 'offValue']),
        ],
        `${path}.${f.id}`,
      );
    });
    p.measurements.forEach((m) => {
      if (
        !m ||
        ![3, 4].includes(m.functionCode) ||
        !ENGINEERING_UNITS.includes(m.unit) ||
        !['live', 'cumulative'].includes(m.kind) ||
        (m.decimalPlaces !== undefined && !integer(m.decimalPlaces, 0, 3)) ||
        !integer(m.pollIntervalMs, 100, 3600000)
      )
        fail(path, 'measurement requires FC03/04, physical unit, kind, poll interval 100..3600000ms');
      if (m?.rollover !== undefined && (m.kind !== 'cumulative' || !Number.isFinite(m.rollover) || m.rollover <= 0))
        fail(path, 'rollover must be an explicit positive raw modulus on cumulative measurements');
      if (m?.kind === 'cumulative' && m.scale <= 0) fail(path, 'cumulative measurements require a positive scale');
      if (m?.encoding !== undefined && (m.encoding !== 'bcd' || !['uint16', 'uint32'].includes(m.dataType)))
        fail(path, 'BCD encoding requires an unsigned integer measurement');
      if (
        m?.section !== undefined &&
        !['electrical', 'active-energy', 'reactive-energy', 'quadrant-energy', 'information'].includes(m.section)
      )
        fail(path, 'unsupported measurement section');
      if (m?.display !== undefined && !['hex', 'ascii'].includes(m.display))
        fail(path, 'unsupported measurement display');
      if (
        m?.valueLabels !== undefined &&
        (!object(m.valueLabels) ||
          Object.keys(m.valueLabels).length > 64 ||
          Object.entries(m.valueLabels).some(([key, label]) => !/^-?\d+$/.test(key) || !name(label)))
      )
        fail(path, 'measurement value labels require at most 64 named integer values');
    });
    p.actions.forEach((a) => {
      if (!a || ![5, 6, 16].includes(a.functionCode) || !Number.isFinite(a.onValue) || !Number.isFinite(a.offValue)) {
        fail(path, 'action requires FC05/06/16 and finite on/off values');
        return;
      }
      if (
        a.functionCode === 5 &&
        (a.dataType !== 'uint16' ||
          a.scale !== 1 ||
          a.offset !== 0 ||
          ![0, 1].includes(a.onValue) ||
          ![0, 1].includes(a.offValue))
      )
        fail(path, 'coil action requires identity uint16 and values 0 or 1');
      if (a.functionCode === 6 && registerCount(a) !== 1) fail(path, 'FC06 requires a 16-bit dtype');
      for (const value of [a.onValue, a.offValue]) {
        const raw = (value - a.offset) / a.scale;
        const limits = {
          uint16: [0, 65535],
          int16: [-32768, 32767],
          uint32: [0, 4294967295],
          int32: [-2147483648, 2147483647],
          float32: [-3.4028234663852886e38, 3.4028234663852886e38],
        }[a.dataType];
        if (
          !limits ||
          !Number.isFinite(raw) ||
          raw < limits[0] ||
          raw > limits[1] ||
          (a.dataType !== 'float32' && !Number.isSafeInteger(raw))
        )
          fail(path, 'action on/off value cannot be represented by dtype and transform');
      }
    });
  });
}
