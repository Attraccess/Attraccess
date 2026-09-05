import { constants } from 'node:fs';
import { access, readFile, writeFile } from 'node:fs/promises';
import { connect as connectSocket } from 'node:net';
import type { DeviceAdapter, Snapshot } from './runtime';
import type { ValidationError } from './runtime-types';
import { CC100_DIGITAL_PROFILE } from './onboard-profile';

type Point = Snapshot['physicalPoints'][number];

export class Cc100OnboardIoAdapter implements DeviceAdapter {
  private writes: Promise<void> = Promise.resolve();

  constructor(
    private readonly registers = {
      input: CC100_DIGITAL_PROFILE.registers.input.path as string,
      output: CC100_DIGITAL_PROFILE.registers.output.path as string,
    },
  ) {}

  validate(snapshot: Snapshot): ValidationError[] {
    const errors: ValidationError[] = [];
    const addresses = new Set<number>();
    snapshot.physicalPoints.forEach((point, index) => {
      try {
        this.channel(point);
        if (addresses.has(point.channel)) throw new Error('physical channel is mapped more than once');
        addresses.add(point.channel);
      } catch (error) {
        errors.push({
          path: `snapshot.physicalPoints[${index}]`,
          code: 'unsupported_point',
          message: (error as Error).message,
        });
      }
    });
    snapshot.logicalChannels.forEach((logical, index) => {
      const point = snapshot.physicalPoints.find((item) => item.id === logical.physicalPointId);
      if (!point) return;
      const channel = CC100_DIGITAL_PROFILE.channels[point.channel];
      if (!channel) return;
      const direction = channel.direction;
      const hasOutputBehavior =
        logical.pulse ||
        logical.guard ||
        logical.feedback ||
        logical.capabilities.some((capability) => ['output', 'pulse', 'guard', 'feedback'].includes(capability));
      if (
        !logical.capabilities.includes(direction) ||
        logical.capabilities.includes('measurement') ||
        logical.capabilities.includes(direction === 'input' ? 'output' : 'input') ||
        (direction === 'input' && hasOutputBehavior)
      ) {
        errors.push({
          path: `snapshot.logicalChannels[${index}].capabilities`,
          code: 'invalid_direction',
          message: `${channel.name} supports digital ${direction} only`,
        });
      }
      if (
        direction === 'output' &&
        snapshot.logicalChannels.some((other) => other !== logical && other.physicalPointId === point.id)
      ) {
        errors.push({
          path: `snapshot.logicalChannels[${index}].physicalPointId`,
          code: 'duplicate_output',
          message: 'each physical output must have a single logical owner',
        });
      }
    });
    return errors;
  }

  async checkAvailability(): Promise<void> {
    await access(this.registers.input, constants.R_OK);
    await access(this.registers.output, constants.R_OK | constants.W_OK);
  }

  async write(point: Point, value: boolean): Promise<void> {
    const channel = this.channel(point);
    if (channel.direction !== 'output') throw new Error(`${channel.name} is not an output`);
    if (typeof value !== 'boolean') throw new Error('digital outputs require a boolean');
    // All output channels share DOUT_DATA. Keep the read and write in one queue,
    // including after failures; per-logical-channel queues cannot protect this register.
    const write = this.writes.then(async () => {
      const register = await this.readRegister(this.registers.output);
      const mask = 1 << channel.bit;
      await writeFile(this.registers.output, String(value ? register | mask : register & ~mask));
    });
    this.writes = write.catch(() => undefined);
    await write;
  }

  async read(point: Point): Promise<boolean> {
    const channel = this.channel(point);
    if (channel.direction === 'output') await this.writes;
    return Boolean((await this.readRegister(this.registers[channel.direction])) & (1 << channel.bit));
  }

  private channel(point: Point) {
    const channel = CC100_DIGITAL_PROFILE.channels[point.channel];
    if (point.hardwareProfile !== '751-9301' || !Number.isInteger(point.channel) || !channel)
      throw new Error('supported CC100 channels are 0..3 (DO1..DO4) and 4..11 (DI1..DI8)');
    return channel;
  }

  private async readRegister(path: string): Promise<number> {
    const text = (await readFile(path, 'utf8')).trim();
    const value = Number(text);
    if (!/^\d+$/.test(text) || !Number.isSafeInteger(value) || value < 0 || value > 255)
      throw new Error(`invalid packed digital register at ${path}; expected decimal byte`);
    return value;
  }
}

export class ModbusTcpAdapter implements DeviceAdapter {
  constructor(
    private readonly host: string,
    private readonly port = 502,
  ) {}

  async write(point: Point, value: boolean): Promise<void> {
    await this.request(5, point.channel, value ? 0xff00 : 0);
  }

  async read(point: Point): Promise<boolean | number> {
    const response = await this.request(2, point.channel, 1);
    return Boolean(response.at(-1) & 1);
  }

  private request(functionCode: number, address: number, value: number): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const transaction = Math.floor(Math.random() * 0xffff);
      const request = Buffer.alloc(12);
      request.writeUInt16BE(transaction, 0);
      request.writeUInt16BE(0, 2);
      request.writeUInt16BE(6, 4);
      request[6] = 1;
      request[7] = functionCode;
      request.writeUInt16BE(address, 8);
      request.writeUInt16BE(value, 10);
      const socket = connectSocket(this.port, this.host);
      const chunks: Buffer[] = [];
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        if (error) reject(error);
        else resolve(Buffer.concat(chunks));
      };
      socket.setTimeout(5_000);
      socket.once('connect', () => socket.write(request));
      socket.on('data', (chunk) => {
        chunks.push(Buffer.from(chunk));
        const response = Buffer.concat(chunks);
        if (response.length >= 6 && response.length >= 6 + response.readUInt16BE(4)) finish();
      });
      socket.once('end', () => finish(new Error('Modbus TCP connection ended before a complete response')));
      socket.once('timeout', () => finish(new Error('Modbus TCP request timed out')));
      socket.once('error', finish);
    });
  }
}

// CC100 exposes the onboard RS-485 interface as /dev/serial. A serial transport is intentionally
// injected so production deployments can configure baud/parity without granting unrelated devices.
export class Rs485ModbusAdapter implements DeviceAdapter {
  constructor(private readonly exchange: (request: Buffer) => Promise<Buffer>) {}
  async write(point: Point, value: boolean): Promise<void> {
    await this.exchange(Buffer.from([1, 5, point.channel >> 8, point.channel & 0xff, value ? 0xff : 0, 0]));
  }
  async read(point: Point): Promise<boolean | number> {
    const response = await this.exchange(Buffer.from([1, 2, point.channel >> 8, point.channel & 0xff, 0, 1]));
    return Boolean(response.at(-1) & 1);
  }
}

export class MemoryDeviceAdapter implements DeviceAdapter {
  readonly values = new Map<string, boolean | number>();
  async write(point: Point, value: boolean): Promise<void> {
    this.values.set(key(point), value);
  }
  async read(point: Point): Promise<boolean | number> {
    return this.values.get(key(point)) ?? false;
  }
}

function key(point: Point): string {
  return `${point.hardwareProfile}:${point.channel}`;
}
