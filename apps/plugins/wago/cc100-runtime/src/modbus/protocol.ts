// Shared pure configuration model is bundled into both the plugin and standalone runtime.
// eslint-disable-next-line @nx/enforce-module-boundaries
import { registerCount, type RegisterFormat, wireAddress } from '../../../modbus/model';

export class ModbusException extends Error {
  readonly code = 'modbus_exception';
  constructor(
    readonly functionCode: number,
    readonly exceptionCode: number,
  ) {
    super(`Modbus FC${functionCode} exception ${exceptionCode}`);
  }
}
export function validateRequest(unit: number, pdu: Buffer): void {
  if (!Number.isInteger(unit) || unit < 1 || unit > 247 || ![3, 4, 5, 6, 16].includes(pdu[0]))
    throw new Error('unsupported unit/function');
  if (pdu.length < 5) throw new Error('truncated Modbus request');
  const address = pdu.readUInt16BE(1);
  const value = pdu.readUInt16BE(3);
  if (pdu[0] === 16) {
    if (value < 1 || value > 123 || address + value > 65536 || pdu.length !== 6 + value * 2 || pdu[5] !== value * 2)
      throw new Error('invalid FC16 quantity/byte count');
  } else {
    if (pdu.length !== 5) throw new Error('invalid Modbus request length');
    if ([3, 4].includes(pdu[0]) && (value < 1 || value > 125 || address + value > 65536))
      throw new Error('invalid read quantity');
    if (pdu[0] === 5 && value !== 0 && value !== 0xff00) throw new Error('invalid coil value');
  }
}
export function crc16(bytes: Buffer): number {
  let crc = 0xffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = crc & 1 ? (crc >>> 1) ^ 0xa001 : crc >>> 1;
  }
  return crc;
}
export function rtuFrame(unit: number, pdu: Buffer): Buffer {
  const frame = Buffer.concat([Buffer.from([unit]), pdu, Buffer.alloc(2)]);
  frame.writeUInt16LE(crc16(frame.subarray(0, -2)), frame.length - 2);
  return frame;
}
export function validateResponse(request: Buffer, response: Buffer): Buffer {
  if (response[0] === (request[0] | 0x80) && response.length === 2) throw new ModbusException(request[0], response[1]);
  if (response[0] !== request[0]) throw new Error('Modbus function mismatch');
  if ([3, 4].includes(request[0])) {
    const bytes = request.readUInt16BE(3) * 2;
    if (response[1] !== bytes || response.length !== bytes + 2) throw new Error('Modbus register byte count mismatch');
    return response.subarray(2);
  }
  if (![5, 6, 16].includes(request[0]) || !response.equals(request.subarray(0, 5)))
    throw new Error('Modbus write echo mismatch');
  return response;
}
export function readPdu(functionCode: 3 | 4, format: RegisterFormat): Buffer {
  const pdu = Buffer.alloc(5);
  pdu[0] = functionCode;
  pdu.writeUInt16BE(wireAddress(format), 1);
  pdu.writeUInt16BE(registerCount(format), 3);
  return pdu;
}
function reorder(bytes: Buffer, format: RegisterFormat): Buffer {
  const result = Buffer.from(bytes);
  if (format.byteOrder === 'little') result.swap16();
  if (format.wordOrder === 'little' && result.length === 4)
    return Buffer.concat([result.subarray(2), result.subarray(0, 2)]);
  return result;
}
export function decodeRaw(bytes: Buffer, format: RegisterFormat): number {
  if (bytes.length !== registerCount(format) * 2) throw new Error('register width mismatch');
  const b = reorder(bytes, format);
  const raw =
    format.dataType === 'float32'
      ? b.readFloatBE()
      : format.dataType === 'uint32'
        ? b.readUInt32BE()
        : format.dataType === 'int32'
          ? b.readInt32BE()
          : format.dataType === 'int16'
            ? b.readInt16BE()
            : b.readUInt16BE();
  if (!Number.isFinite(raw)) throw new Error('non-finite register value');
  return raw;
}
export function encode(value: number, format: RegisterFormat): Buffer {
  const raw = (value - format.offset) / format.scale;
  if (!Number.isFinite(raw) || (format.dataType !== 'float32' && !Number.isSafeInteger(raw)))
    throw new Error('action value is not representable');
  const b = Buffer.alloc(registerCount(format) * 2);
  switch (format.dataType) {
    case 'float32':
      b.writeFloatBE(raw);
      if (!Number.isFinite(b.readFloatBE())) throw new Error('float overflow');
      break;
    case 'uint32':
      b.writeUInt32BE(raw);
      break;
    case 'int32':
      b.writeInt32BE(raw);
      break;
    case 'uint16':
      b.writeUInt16BE(raw);
      break;
    case 'int16':
      b.writeInt16BE(raw);
      break;
    default:
      throw new Error('unsupported register dtype');
  }
  return reorder(b, format);
}
export function writePdu(functionCode: 5 | 6 | 16, format: RegisterFormat, value: number): Buffer {
  const bytes = functionCode === 5 ? Buffer.from(value === 1 ? [255, 0] : [0, 0]) : encode(value, format);
  if (functionCode === 5 && value !== 0 && value !== 1) throw new Error('coil requires 0 or 1');
  if (functionCode === 6 && bytes.length !== 2) throw new Error('FC06 requires one register');
  const pdu = Buffer.alloc(functionCode === 16 ? 6 + bytes.length : 5);
  pdu[0] = functionCode;
  pdu.writeUInt16BE(wireAddress(format), 1);
  if (functionCode === 16) {
    pdu.writeUInt16BE(bytes.length / 2, 3);
    pdu[5] = bytes.length;
    bytes.copy(pdu, 6);
  } else bytes.copy(pdu, 3);
  return pdu;
}
