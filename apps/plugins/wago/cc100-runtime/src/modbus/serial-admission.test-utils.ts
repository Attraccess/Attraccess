import * as processes from 'node:child_process';
import { Duplex } from 'node:stream';
import { hash, JsonStateStore, type RuntimeState, type Snapshot, WagoRuntime } from '../runtime';

import { ModbusDeviceRouter } from './adapter';
export const PYTHON_FIXTURE = `
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

export let fixtureId = 0;

export function snapshot(): Snapshot {
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

export class MemoryStore extends JsonStateStore {
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
export class SerialAdmissionFixture {
  readonly base = 2000000000000;

  now!: number;

  writes!: string[];

  stages!: string[];

  onStage!: (stage: string, elapsed: number) => Promise<void>;

  closed!: Promise<void>[];

  mode!: 'normal' | 'partial-failure' | 'late-grant';

  harness(s = snapshot()) {
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

  command(expiresAt: number, id = 'expires') {
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

  setup() {
    this.now = this.base;
    this.mode = 'normal';
    this.writes = [];
    this.stages = [];
    this.closed = [];
    this.onStage = async () => undefined;
    jest.spyOn(Date, 'now').mockImplementation(() => this.now);
    const spawn = jest.requireActual<typeof processes>('node:child_process').spawn;
    jest
      .mocked(processes.spawn)
      .mockReset()
      .mockImplementation((file, args, options) => {
        if (file !== 'python3' || !Array.isArray(args) || args[0] !== '-c')
          throw new Error('unexpected fixture process');
        const child = spawn(
          file,
          ['-c', PYTHON_FIXTURE + `mode=${JSON.stringify(this.mode)}\n` + args[1], ...args.slice(2)],
          {
            ...options,
            stdio: ['pipe', 'pipe', 'pipe', 'pipe', 'pipe'],
          },
        );
        this.closed.push(new Promise((resolve) => child.once('close', () => resolve())));
        const control = child.stdio[4] as Duplex;
        let text = '';
        control.on('data', (chunk) => {
          text += chunk.toString();
          while (text.includes('\n')) {
            const end = text.indexOf('\n');
            const event = JSON.parse(text.slice(0, end));
            text = text.slice(end + 1);
            if (event.write) this.writes.push(event.write);
            else {
              this.stages.push(event.stage);
              void this.onStage(event.stage, event.elapsed).then(() => control.write('!'));
            }
          }
        });
        return child;
      });
  }

  async cleanup() {
    await Promise.all(this.closed);
    jest.restoreAllMocks();
  }
}
