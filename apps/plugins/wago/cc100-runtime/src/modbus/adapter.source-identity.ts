import { modbusHostIdentity, type ModbusConnection, type ModbusMeasurement } from '../../../modbus/model';

export function sourceIdentity(connection: ModbusConnection, unit: number, m: ModbusMeasurement): string {
  const endpoint =
    connection.transport === 'tcp'
      ? ['tcp', modbusHostIdentity(connection.host), connection.port]
      : ['rtu', connection.path, connection.baudRate, connection.parity, connection.stopBits];
  return JSON.stringify([
    endpoint,
    unit,
    m.functionCode,
    m.address - m.addressBase,
    m.dataType,
    m.byteOrder,
    m.wordOrder,
    m.scale,
    m.offset,
    m.unit,
    m.kind,
    m.rollover ?? null,
    m.decimalPlaces ?? null,
    m.encoding ?? null,
  ]);
}
