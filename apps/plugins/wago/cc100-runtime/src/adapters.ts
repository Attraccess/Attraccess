import { readFile, writeFile } from 'node:fs/promises';
import { connect as connectSocket } from 'node:net';
import type { DeviceAdapter, Snapshot } from './runtime';

type Point = Snapshot['physicalPoints'][number];

// Point paths are supplied by deployment because firmware revisions enumerate IIO devices differently.
export class Cc100OnboardIoAdapter implements DeviceAdapter {
  constructor(private readonly paths: Record<string, { output?: string; input?: string }>) {}

  async write(point: Point, value: boolean): Promise<void> {
    const path = this.paths[key(point)]?.output;
    if (!path) throw new Error(`no output path configured for ${key(point)}`);
    await writeFile(path, value ? '1' : '0');
  }

  async read(point: Point): Promise<boolean | number> {
    const path = this.paths[key(point)]?.input;
    if (!path) throw new Error(`no input path configured for ${key(point)}`);
    const value = (await readFile(path, 'utf8')).trim();
    return /^-?\d+(\.\d+)?$/.test(value) ? Number(value) : value === '1';
  }
}

export class ModbusTcpAdapter implements DeviceAdapter {
  constructor(private readonly host: string, private readonly port = 502) {}

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
  async write(point: Point, value: boolean): Promise<void> { this.values.set(key(point), value); }
  async read(point: Point): Promise<boolean | number> { return this.values.get(key(point)) ?? false; }
}

function key(point: Point): string { return `${point.hardwareProfile}:${point.channel}`; }
