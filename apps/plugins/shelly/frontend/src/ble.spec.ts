// Vitest runs without globals here, so the test API is imported explicitly.
import { describe, expect, it, vi } from 'vitest';
import {
  connectShellyOverBle,
  disableBleRadio,
  provisionWifiOverBle,
  ShellyBleRpc,
  type GattCharacteristic,
  type RpcChannel,
} from './ble';

const noSleep = () => Promise.resolve();

/**
 * Stands in for a Shelly's GATT triple: collects the framed request, hands the
 * decoded JSON to `handler`, then serves the answer back in MTU-sized reads.
 */
class FakeShelly {
  readonly requests: unknown[] = [];
  readonly writtenChunkSizes: number[] = [];

  private declaredLength = 0;
  private request: number[] = [];
  private response = new Uint8Array(0);
  private readCursor = 0;

  constructor(
    private readonly handler: (request: { method: string; params?: unknown }) => unknown,
    private readonly mtu = 20,
  ) {}

  get channel(): RpcChannel {
    return { data: this.data, txControl: this.txControl, rxControl: this.rxControl };
  }

  private readonly txControl: GattCharacteristic = {
    writeValue: async (value) => {
      this.declaredLength = new DataView(value.buffer, value.byteOffset, value.byteLength).getUint32(0, false);
      this.request = [];
      this.readCursor = 0;
      this.response = new Uint8Array(0);
    },
    readValue: async () => {
      throw new Error('tx control is write-only');
    },
  };

  private readonly rxControl: GattCharacteristic = {
    writeValue: async () => {
      throw new Error('rx control is read-only');
    },
    readValue: async () => {
      const remaining = this.response.length - this.readCursor;
      const bytes = new Uint8Array(4);
      new DataView(bytes.buffer).setUint32(0, remaining, false);
      return new DataView(bytes.buffer);
    },
  };

  private readonly data: GattCharacteristic = {
    writeValue: async (value) => {
      this.writtenChunkSizes.push(value.byteLength);
      this.request.push(...value);
      if (this.request.length < this.declaredLength) return;

      const decoded = JSON.parse(new TextDecoder().decode(new Uint8Array(this.request)));
      this.requests.push(decoded);
      this.response = new TextEncoder().encode(JSON.stringify(this.handler(decoded)));
      this.readCursor = 0;
    },
    readValue: async () => {
      const slice = this.response.slice(this.readCursor, this.readCursor + this.mtu);
      this.readCursor += slice.length;
      return new DataView(slice.buffer, slice.byteOffset, slice.byteLength);
    },
  };
}

describe('ShellyBleRpc', () => {
  it('frames a request, chunks it under the MTU and reassembles the answer', async () => {
    const device = new FakeShelly(({ method }) => ({
      id: 1,
      result: { id: 'shellypro1pm-aabbcc', model: 'SPSW-201PE16EU', gen: 2, method },
    }));
    const rpc = new ShellyBleRpc(device.channel, { sleep: noSleep });

    const info = await rpc.call<{ id: string; method: string }>('Shelly.GetDeviceInfo');

    expect(info.id).toBe('shellypro1pm-aabbcc');
    expect(info.method).toBe('Shelly.GetDeviceInfo');
    expect(device.requests[0]).toMatchObject({ id: 1, src: 'attraccess', method: 'Shelly.GetDeviceInfo' });
    // The response is longer than one 20-byte read, so reassembly is exercised.
    expect(Math.max(...device.writtenChunkSizes)).toBeLessThanOrEqual(20);
    expect(device.writtenChunkSizes.length).toBeGreaterThan(1);
  });

  it('sends params and increments the request id per call', async () => {
    const device = new FakeShelly(() => ({ result: { ok: true } }));
    const rpc = new ShellyBleRpc(device.channel, { sleep: noSleep });

    await rpc.call('WiFi.SetConfig', { config: { sta: { ssid: 'Workshop' } } });
    await rpc.call('WiFi.GetStatus');

    expect(device.requests[0]).toMatchObject({ id: 1, params: { config: { sta: { ssid: 'Workshop' } } } });
    expect(device.requests[1]).toMatchObject({ id: 2 });
  });

  it('turns an RPC error payload into a thrown error', async () => {
    const device = new FakeShelly(() => ({ error: { code: -103, message: 'No handler for WiFi.SetConfig' } }));
    const rpc = new ShellyBleRpc(device.channel, { sleep: noSleep });

    await expect(rpc.call('WiFi.SetConfig')).rejects.toThrow(/No handler for WiFi.SetConfig \(code -103\)/);
  });

  it('times out when the device never reports a response length', async () => {
    const silent: GattCharacteristic = {
      writeValue: async () => undefined,
      readValue: async () => new DataView(new Uint8Array(4).buffer),
    };
    const rpc = new ShellyBleRpc(
      { data: silent, txControl: silent, rxControl: silent },
      {
        sleep: noSleep,
        timeoutMs: 0,
      },
    );

    await expect(rpc.call('Shelly.GetDeviceInfo')).rejects.toThrow(/Timed out waiting for the device/);
  });

  it('rejects an oversized response before allocating its buffer', async () => {
    const oversized: GattCharacteristic = {
      writeValue: async () => undefined,
      readValue: async () => {
        const bytes = new Uint8Array(4);
        new DataView(bytes.buffer).setUint32(0, 1024 * 1024 + 1, false);
        return new DataView(bytes.buffer);
      },
    };
    const rpc = new ShellyBleRpc({ data: oversized, txControl: oversized, rxControl: oversized });

    await expect(rpc.call('Shelly.GetDeviceInfo')).rejects.toThrow(/response is too large/);
  });

  it('disconnects when characteristic discovery fails', async () => {
    const disconnect = vi.fn();
    const characteristic: GattCharacteristic = {
      readValue: async () => new DataView(new ArrayBuffer(0)),
      writeValue: async () => undefined,
    };
    const bluetooth = {
      requestDevice: async () => ({
        gatt: {
          connect: async () => ({
            getPrimaryService: async () => ({
              getCharacteristic: async (uuid: string) => {
                if (uuid.endsWith('5f')) throw new Error('missing characteristic');
                return characteristic;
              },
            }),
          }),
          disconnect,
        },
      }),
    };

    await expect(connectShellyOverBle(bluetooth)).rejects.toThrow(/required Shelly RPC Bluetooth characteristics/);
    expect(disconnect).toHaveBeenCalledOnce();
  });
});

describe('provisionWifiOverBle', () => {
  function rpcStub(responses: Record<string, unknown[]>) {
    const calls: { method: string; params?: Record<string, unknown> }[] = [];
    const queues = Object.fromEntries(Object.entries(responses).map(([k, v]) => [k, [...v]]));
    return {
      calls,
      rpc: {
        call: async <T>(method: string, params?: Record<string, unknown>): Promise<T> => {
          calls.push({ method, params });
          const queue = queues[method];
          if (!queue) return undefined as T;
          return (queue.length > 1 ? queue.shift() : queue[0]) as T;
        },
      },
    };
  }

  it('pushes credentials, waits for an address and reports the stages', async () => {
    const { rpc, calls } = rpcStub({
      'Shelly.GetDeviceInfo': [{ id: 'shellypro1pm-aabbcc', model: 'SPSW-201PE16EU', gen: 2 }],
      'WiFi.SetConfig': [{ restart_required: false }],
      'WiFi.GetStatus': [{ status: 'connecting' }, { status: 'got ip', sta_ip: '192.168.1.42' }],
    });
    const stages: string[] = [];

    const result = await provisionWifiOverBle(
      rpc,
      { ssid: 'Workshop', password: 'hunter22' },
      { onStage: (s) => stages.push(s), sleep: noSleep },
    );

    expect(result).toEqual({
      info: { id: 'shellypro1pm-aabbcc', model: 'SPSW-201PE16EU', gen: 2 },
      ipAddress: '192.168.1.42',
      restartRequired: false,
    });
    expect(stages).toEqual(['identifying', 'sending-credentials', 'joining']);
    expect(calls[1]).toEqual({
      method: 'WiFi.SetConfig',
      params: { config: { sta: { ssid: 'Workshop', pass: 'hunter22', is_open: false, enable: true } } },
    });
  });

  it('marks an empty password as an open network instead of sending pass:""', async () => {
    const { rpc, calls } = rpcStub({
      'Shelly.GetDeviceInfo': [{ id: 'shelly1' }],
      'WiFi.SetConfig': [{ restart_required: false }],
      'WiFi.GetStatus': [{ status: 'got ip', sta_ip: '10.0.0.5' }],
    });

    await provisionWifiOverBle(rpc, { ssid: 'Guest', password: '' }, { sleep: noSleep });

    expect(calls[1].params).toEqual({ config: { sta: { ssid: 'Guest', is_open: true, enable: true } } });
  });

  it('reboots and gives up on reading the address when the device demands a restart', async () => {
    const { rpc, calls } = rpcStub({
      'Shelly.GetDeviceInfo': [{ id: 'shelly1' }],
      'WiFi.SetConfig': [{ restart_required: true }],
    });

    const result = await provisionWifiOverBle(rpc, { ssid: 'Workshop', password: 'x' }, { sleep: noSleep });

    expect(result).toMatchObject({ ipAddress: null, restartRequired: true });
    expect(calls.map((c) => c.method)).toEqual(['Shelly.GetDeviceInfo', 'WiFi.SetConfig', 'Shelly.Reboot']);
  });

  it('treats a lost link during a required reboot as success', async () => {
    const rpc = {
      call: async <T>(method: string): Promise<T> => {
        if (method === 'Shelly.GetDeviceInfo') return { id: 'shelly1' } as T;
        if (method === 'WiFi.SetConfig') return { restart_required: true } as T;
        throw new Error('GATT server disconnected');
      },
    };

    await expect(provisionWifiOverBle(rpc, { ssid: 'Workshop', password: 'x' })).resolves.toMatchObject({
      ipAddress: null,
      restartRequired: true,
    });
  });

  it('rejects an address outside the private IPv4 ranges', async () => {
    const { rpc } = rpcStub({
      'Shelly.GetDeviceInfo': [{ id: 'shelly1' }],
      'WiFi.SetConfig': [{ restart_required: false }],
      'WiFi.GetStatus': [{ status: 'got ip', sta_ip: '127.0.0.1:3000' }],
    });

    await expect(provisionWifiOverBle(rpc, { ssid: 'Workshop', password: 'x' })).rejects.toThrow(
      /invalid private IPv4/,
    );
  });

  it('fails with the last WiFi status when the device never joins', async () => {
    const { rpc } = rpcStub({
      'Shelly.GetDeviceInfo': [{ id: 'shelly1' }],
      'WiFi.SetConfig': [{ restart_required: false }],
      'WiFi.GetStatus': [{ status: 'disconnected' }],
    });

    await expect(
      provisionWifiOverBle(rpc, { ssid: 'Workshop', password: 'wrong' }, { sleep: noSleep, joinTimeoutMs: 0 }),
    ).rejects.toThrow(/did not join "Workshop".*last status: disconnected.*2\.4 GHz/s);
  });
});

describe('disableBleRadio', () => {
  function rpcSpy(reply: (method: string) => unknown) {
    const calls: { method: string; params?: Record<string, unknown> }[] = [];
    return {
      calls,
      rpc: {
        call: async <T>(method: string, params?: Record<string, unknown>): Promise<T> => {
          calls.push({ method, params });
          const result = reply(method);
          if (result instanceof Error) throw result;
          return result as T;
        },
      },
    };
  }

  it('disables the radio without a reboot when the device does not ask for one', async () => {
    const { rpc, calls } = rpcSpy(() => ({ restart_required: false }));

    await disableBleRadio(rpc);

    expect(calls).toEqual([{ method: 'BLE.SetConfig', params: { config: { enable: false } } }]);
  });

  it('reboots when the setting only takes effect after a restart', async () => {
    const { rpc, calls } = rpcSpy(() => ({ restart_required: true }));

    await disableBleRadio(rpc);

    expect(calls.map((c) => c.method)).toEqual(['BLE.SetConfig', 'Shelly.Reboot']);
  });

  it('treats a lost link during the reboot as success', async () => {
    const { rpc } = rpcSpy((method) =>
      method === 'Shelly.Reboot' ? new Error('GATT server disconnected') : { restart_required: true },
    );

    await expect(disableBleRadio(rpc)).resolves.toBeUndefined();
  });

  it('propagates a device that refuses to disable its radio', async () => {
    const { rpc } = rpcSpy(() => new Error('BLE.SetConfig failed: no handler (code -103)'));

    await expect(disableBleRadio(rpc)).rejects.toThrow(/no handler/);
  });
});
