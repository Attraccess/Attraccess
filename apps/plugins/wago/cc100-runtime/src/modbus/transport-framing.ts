import { crc16 } from './protocol';

export function rtuPayload(frame: Buffer, unit: number): Buffer {
  if (
    frame.length < 5 ||
    frame.length > 256 ||
    frame[0] !== unit ||
    crc16(frame.subarray(0, -2)) !== frame.readUInt16LE(frame.length - 2)
  )
    throw new Error('Modbus RTU unit/CRC/length mismatch');
  return frame.subarray(1, -2);
}

export function deadline<T>(operation: Promise<T>, ms: number, onTimeout: () => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      onTimeout();
      reject(new Error('Modbus request timed out'));
    }, ms);
    operation.then(resolve, reject).finally(() => clearTimeout(timer));
  });
}
