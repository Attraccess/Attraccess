import * as processes from 'node:child_process';
import { Duplex } from 'node:stream';
import { hash, JsonStateStore, type RuntimeState, type Snapshot, WagoRuntime } from '../runtime';
import { OutputController } from '../output-controller';
import { ModbusDeviceRouter } from './adapter';

jest.mock('node:child_process', () => ({ ...jest.requireActual('node:child_process'), spawn: jest.fn() }));

// Execute the actual production Python program. Replace only its OS/clock boundary:
// no serial path is opened, and every preparation stage is synchronized with Node.
const PYTHON_FIXTURE = `
import os,sys,types,json,time as real_time
real_write,real_read=os.write,os.read
elapsed=0.0
sent=b''
def event(stage):
 real_write(4,(json.dumps({'stage':stage,'elapsed':elapsed})+'\\n').encode())
 if real_read(4,1)!=b'!': raise RuntimeError('fixture controller closed')
def advance(stage,seconds):
 global elapsed
 elapsed+=seconds
 event(stage)
def write(fd,data):
 global sent
 if fd!=101: return real_write(fd,data)
 if mode=='partial-failure' and sent: raise OSError('fixture partial write failure')
 n=3 if mode=='partial-failure' else len(data)
 sent+=data[:n]
 real_write(4,(json.dumps({'write':data[:n].hex()})+'\\n').encode())
 return n
os.open=lambda *args: 101
os.close=lambda fd: None
os.write=write
os.read=lambda fd,n: sent if fd==101 else real_read(fd,n)
t=types.ModuleType('termios')
for name in ['CLOCAL','CREAD','CS8','PARENB','PARODD','CSTOPB','VMIN','VTIME','TCSANOW','TCIOFLUSH','B1200']:
 setattr(t,name,0)
t.tcgetattr=lambda fd: [0,0,0,0,0,0,[0]]
t.tcsetattr=lambda *args: advance('prepare',0.05)
t.tcflush=lambda *args: event('flush')
sys.modules['termios']=t
f=types.ModuleType('fcntl'); f.LOCK_EX=1; f.LOCK_NB=2; f.flock=lambda *args: None
sys.modules['fcntl']=f
clock=types.ModuleType('time')
clock.monotonic=lambda: elapsed
def walltime():
 if mode=='late-grant': advance('grant-delay',1.0)
 return 2000000000+elapsed
clock.time=walltime
clock.sleep=lambda seconds: advance('silence',seconds)
sys.modules['time']=clock
sel=types.ModuleType('select')
def select(read,write,errors,timeout):
 if write: advance('writable',0.05)
 return (read,write,[])
sel.select=select
sys.modules['select']=sel
`;

let fixtureId = 0;
function snapshot(): Snapshot {
  return {
    version: 1,
    modbus: {
      connections: [
        {
          id: 'bus',
          transport: 'rtu',
          path: `/dev/python-fixture-${++fixtureId}`,
          baudRate: 1200,
          parity: 'even',
          stopBits: 1,
          timeoutMs: 1000,
          reconnectMs: 0,
          queueLimit: 4,
        },
      ],
      devices: [
        { id: 'device', name: 'Device', connectionId: 'bus', unitId: 1, profileId: 'profile', profileVersion: 1 },
      ],
      profiles: [
        {
          id: 'profile',
          name: 'Profile',
          version: 1,
          measurements: [],
          actions: [
            {
              id: 'switch',
              name: 'Switch',
              functionCode: 6,
              address: 12,
              addressBase: 0,
              dataType: 'uint16',
              byteOrder: 'big',
              wordOrder: 'big',
              scale: 1,
              offset: 0,
              onValue: 1,
              offValue: 0,
            },
          ],
        },
      ],
    },
    physicalPoints: [
      { id: 'point', hardwareProfile: 'modbus', channel: 0, modbus: { deviceId: 'device', actionId: 'switch' } },
    ],
    logicalChannels: [
      {
        id: 'output',
        physicalPointId: 'point',
        profile: 'generic-digital-output',
        capabilities: ['output'],
        disconnectPolicy: { mode: 'watchdog', timeoutMs: 1 },
      },
    ],
  };
}
class MemoryStore extends JsonStateStore {
  saved: RuntimeState;
  constructor(s: Snapshot) {
    super('/unused-python-fixture');
    this.saved = { outputs: {}, commandIds: [], accepted: { revision: 1, contentHash: hash(s), snapshot: s } };
  }
  override async load() {
    return structuredClone(this.saved);
  }
  override async save(state: RuntimeState) {
    this.saved = structuredClone(state);
  }
}

describe('RTU admission through production Python preparation (mock OS, no hardware)', () => {
  const base = 2000000000000;
  let now: number;
  let writes: string[];
  let stages: string[];
  let onStage: (stage: string, elapsed: number) => Promise<void>;
  let closed: Promise<void>[];
  let mode: 'normal' | 'partial-failure' | 'late-grant';
  beforeEach(() => {
    now = base;
    mode = 'normal';
    writes = [];
    stages = [];
    closed = [];
    onStage = async () => undefined;
    jest.spyOn(Date, 'now').mockImplementation(() => now);
    const spawn = jest.requireActual<typeof processes>('node:child_process').spawn;
    jest
      .mocked(processes.spawn)
      .mockReset()
      .mockImplementation((file, args, options) => {
        if (file !== 'python3' || !Array.isArray(args) || args[0] !== '-c')
          throw new Error('unexpected fixture process');
        const child = spawn(
          file,
          ['-c', PYTHON_FIXTURE + `mode=${JSON.stringify(mode)}\n` + args[1], ...args.slice(2)],
          {
            ...options,
            stdio: ['pipe', 'pipe', 'pipe', 'pipe', 'pipe'],
          },
        );
        closed.push(new Promise((resolve) => child.once('close', () => resolve())));
        const control = child.stdio[4] as Duplex;
        let text = '';
        control.on('data', (chunk) => {
          text += chunk.toString();
          while (text.includes('\n')) {
            const end = text.indexOf('\n');
            const event = JSON.parse(text.slice(0, end));
            text = text.slice(end + 1);
            if (event.write) writes.push(event.write);
            else {
              stages.push(event.stage);
              void onStage(event.stage, event.elapsed).then(() => control.write('!'));
            }
          }
        });
        return child;
      });
  });
  afterEach(async () => {
    await Promise.all(closed);
    jest.restoreAllMocks();
  });
  function harness(s = snapshot()) {
    const device = new ModbusDeviceRouter({ read: async () => false, write: async () => undefined });
    const store = new MemoryStore(s);
    const published: unknown[] = [];
    const runtime = new WagoRuntime({
      hardwareId: 'fixture',
      pairingCode: 'fixture',
      prefix: 'fixture',
      device,
      store,
      transport: {
        subscribe: async () => undefined,
        publish: async (_topic, payload) => {
          published.push(payload);
        },
      },
    });
    return { runtime, store, device, published };
  }
  function command(expiresAt: number, id = 'expires') {
    return Buffer.from(
      JSON.stringify({
        id,
        channelId: 'output',
        action: 'set',
        value: true,
        expectedConfigurationRevision: 1,
        expiresAt: new Date(expiresAt).toISOString(),
      }),
    );
  }
  it.each(['prepare', 'silence', 'writable'])(
    'rejects ON expiring during Python %s with no transmitted bytes',
    async (stage) => {
      const { runtime, store, published } = harness();
      await runtime.start();
      onStage = async (current) => {
        if (current === stage) now = base + 11;
      };
      await runtime.receiveCommand(command(base + 10));
      expect(stages).toContain(stage);
      expect(writes).toEqual([]);
      expect(published.at(-1)).toMatchObject({ status: 'rejected', code: 'expired' });
      expect(store.saved.outputs.output).not.toBe(true);
      expect(store.saved.uncertainOutputChannelIds).toEqual([]);
      // A proven pre-send rejection must not quarantine the unused bus.
      await runtime.receiveCommand(command(base + 10000, 'fresh'));
      expect(writes).toHaveLength(1);
      expect(published.at(-1)).toMatchObject({ status: 'accepted' });
    },
  );
  it.each(['prepare', 'silence', 'writable'])(
    'cancels watchdog OFF when reconnect occurs during Python %s',
    async (stage) => {
      const s = snapshot();
      const { device } = harness(s);
      device.configure(s);
      const state: RuntimeState = { outputs: { output: true }, commandIds: [] };
      const outputs = new OutputController({
        device,
        getSnapshot: () => s,
        getState: () => state,
        saveState: async () => undefined,
        publishState: () => undefined,
        publishFault: async () => undefined,
      });
      let finished!: () => void;
      const completion = new Promise<void>((resolve) => {
        finished = resolve;
      });
      const write = device.write.bind(device);
      jest.spyOn(device, 'write').mockImplementation(async (...args) => {
        try {
          await write(...args);
        } finally {
          finished();
        }
      });
      onStage = async (current) => {
        if (current === stage) await outputs.applyDisconnectPolicies(true);
      };
      await outputs.applyDisconnectPolicies(false);
      await completion;
      expect(stages).toContain(stage);
      expect(writes).toEqual([]);
      expect(state.outputs.output).toBe(true);
    },
  );
  it('checks absolute expiry in Python even if delivery of the grant is delayed', async () => {
    mode = 'late-grant';
    const { runtime, store, published } = harness();
    await runtime.start();
    // Node still sees a valid command; the Python clock advances beyond it after admission.
    await runtime.receiveCommand(command(base + 1000));
    expect(stages).toContain('grant-delay');
    expect(writes).toEqual([]);
    expect(published.at(-1)).toMatchObject({ status: 'rejected', code: 'expired' });
    expect(store.saved.uncertainOutputChannelIds).toEqual([]);
  });

  it('retains deduplication, uncertainty and quarantine after a partial production write', async () => {
    mode = 'partial-failure';
    const { runtime, store, published } = harness();
    await runtime.start();
    await runtime.receiveCommand(command(base + 10000, 'unknown'));
    expect(writes).toEqual(['010600']);
    expect(store.saved.uncertainOutputChannelIds).toEqual(['output']);
    expect(store.saved.commandIds).toContain('unknown');
    expect(published.at(-1)).toMatchObject({ status: 'rejected' });
    await runtime.receiveCommand(command(base + 10000, 'unknown'));
    expect(published.at(-1)).toMatchObject({ status: 'duplicate' });
    // Neither a fresh command nor a replacement router can reset the quarantined bus.
    await runtime.receiveCommand(command(base + 10000, 'fresh'));
    const replacement = new ModbusDeviceRouter({ read: async () => false, write: async () => undefined });
    const accepted = store.saved.accepted;
    if (!accepted) throw new Error('missing fixture configuration');
    replacement.configure(accepted.snapshot);
    await expect(replacement.write(accepted.snapshot.physicalPoints[0], false)).rejects.toMatchObject({
      code: 'modbus_rtu_quarantined',
    });
    expect(writes).toEqual(['010600']);
    expect(processes.spawn).toHaveBeenCalledTimes(1);
  });

  it('still shuts down an admitted pulse after its original command expires', async () => {
    const s = snapshot();
    s.logicalChannels[0].capabilities.push('pulse');
    s.logicalChannels[0].pulse = { durationMs: 10 };
    const { runtime, store, device } = harness(s);
    await runtime.start();
    let finished!: () => void;
    const completion = new Promise<void>((resolve) => {
      finished = resolve;
    });
    const write = device.write.bind(device);
    jest.spyOn(device, 'write').mockImplementation(async (...args) => {
      await write(...args);
      if (!args[1]) finished();
    });
    await runtime.receiveCommand(
      Buffer.from(
        JSON.stringify({
          ...JSON.parse(command(base + 1000).toString()),
          action: 'pulse',
        }),
      ),
    );
    now = base + 2000;
    await completion;
    // Let the output controller persist the successful OFF.
    for (let i = 0; i < 20; i++) await Promise.resolve();
    expect(writes).toEqual(['0106000c00018809', '0106000c000049c9']);
    expect(store.saved.outputs.output).toBe(false);
    expect(store.saved.pendingPulseChannelIds).toEqual([]);
  });
});
