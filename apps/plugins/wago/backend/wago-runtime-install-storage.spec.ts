import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fw31ShellFixture } from './fixtures/fw31-shell-fixture';
import { WAGO_DOUT } from './wago-hardware-deployment';
import {
  runtimeBundleCapacityPreflightScript,
  runtimeBundlePreflightScript,
  runtimeBundleStagingCapacityPreflightScript,
} from './wago-runtime-install';

describe('read-only runtime capacity preflight (isolated commands only)', () => {
  let fixture: ReturnType<typeof fw31ShellFixture>;
  const mib = 1024 * 1024;
  // Include outer headers/manifest/padding instead of equating inner and outer sizes.
  const bytes = 81 * mib + 10240;
  const b = Math.ceil(bytes / 1024);
  const reserve = 16384;
  const dfHeader = 'Filesystem 1024-blocks Used Available Capacity Mounted on\n';
  const run = () => fixture.run(runtimeBundleCapacityPreflightScript(bytes, fixture.root));
  const runStaging = () => fixture.run(runtimeBundleStagingCapacityPreflightScript(bytes, fixture.root));
  const layout = (devices: number[], free: number[]) => {
    fixture.file('storage.json', JSON.stringify({ devices, free }));
  };
  beforeEach(() => {
    fixture = fw31ShellFixture();
    layout([1, 1, 1, 2], [181 * 1024, 181 * 1024, 181 * 1024, 848 * 1024]);
    const prelude = `#!${process.execPath}
const fs=require('node:fs'), root=process.env.FIXTURE_ROOT, args=process.argv.slice(2);
const statPath=args.at(-1);
if(args[0]==='--help'){console.log('BusyBox v1.37.0 () multi-call binary.\\nUsage: stat [-ltf] FILE...');process.exit(0);}
// The capability probe observes only the isolated root, not a capacity path.
if(args[0]==='-t'&&(statPath==='/'||statPath===root)){
 const s=fs.lstatSync(root,{bigint:true});
 console.log(statPath+' '+[s.size,s.blocks,s.mode.toString(16),s.uid,s.gid,s.dev.toString(16),s.ino,s.nlink,0,0,1,1,1,s.blksize].join(' '));process.exit(0);
}
const paths=['/etc/attraccess-wago','/tmp','/var/lib',fs.existsSync(root+'/docker-root')?fs.readFileSync(root+'/docker-root','utf8').slice(root.length):'/home'];
if(args.at(-1)===root+'/etc')args[args.length-1]=root+'/etc/attraccess-wago';
const i=paths.indexOf(args.at(-1).slice(root.length));
if(!args.at(-1).startsWith(root+'/')||i<0)process.exit(99);
const storage=JSON.parse(fs.readFileSync(root+'/storage.json','utf8'));
`;
    fixture.file(
      'bin/stat',
      prelude +
        `if(args[0]!=='-Lt')process.exit(1);console.log(statPath+' 4096 8 41c0 0 0 '+storage.devices[i].toString(16)+' 123 2 0 0 1 1 1 4096');`,
      0o700,
    );
    fixture.file(
      'bin/df',
      prelude +
        `if(args[0]!=='-Pk')process.exit(99);console.log(${JSON.stringify(dfHeader)}+'fixture 9999999 0 '+storage.free[i]+' 0% /fixture');`,
      0o700,
    );
    fixture.file(
      'bin/docker',
      `#!${process.execPath}
const args=process.argv.slice(2);
if(args.join(' ')!=='--host unix:///var/run/docker.sock info --format {{.DockerRootDir}}')process.exit(99);
const fs=require('node:fs'),root=process.env.FIXTURE_ROOT;
fs.appendFileSync(root+'/docker.log','info\\n');
if(fs.readFileSync(root+'/daemon','utf8')!=='running')process.exit(1);
console.log(fs.existsSync(root+'/docker-root')?fs.readFileSync(root+'/docker-root','utf8'):root+'/home');
`,
      0o700,
    );
  });
  afterEach(() => fixture.dispose());

  it('checks unprepared staging with inactive Docker without querying or activating it', () => {
    fixture.file('daemon', 'stopped');
    fixture.file('plc', 'running');
    rmSync(join(fixture.root, 'etc/attraccess-wago'), { recursive: true });
    expect(runStaging().status).toBe(0);
    expect(existsSync(join(fixture.root, 'docker.log'))).toBe(false);
    expect(existsSync(join(fixture.root, 'vendor.log'))).toBe(false);
    expect(existsSync(join(fixture.root, 'etc/attraccess-wago'))).toBe(false);
    expect(fixture.read('daemon')).toBe('stopped');
    expect(fixture.read('plc')).toBe('running');
    expect(run().status).not.toBe(0);
  });

  it.each([0, 1, 2])('rejects insufficient early staging at path index %s with inactive Docker', (index) => {
    fixture.file('daemon', 'stopped');
    const free = [b + reserve, b + reserve, b + reserve, 999999];
    free[index]--;
    layout([1, 2, 3, 4], free);
    expect(runStaging().stderr).toContain('Insufficient runtime storage');
    expect(runStaging().status).not.toBe(0);
    expect(existsSync(join(fixture.root, 'docker.log'))).toBe(false);
  });

  it('rechecks Docker admission and shared staging capacity after activation', () => {
    fixture.file('daemon', 'stopped');
    layout([1, 1, 1, 1], Array(4).fill(2 * b + reserve));
    expect(runStaging().status).toBe(0);
    fixture.file('daemon', 'running');
    expect(run().stderr).toContain('Insufficient runtime storage');
    expect(run().status).not.toBe(0);
    layout([1, 1, 1, 1], Array(4).fill(5 * b + reserve));
    expect(run().status).toBe(0);
  });

  it('requires staging tools early but neither a Docker binary nor daemon info', () => {
    rmSync(join(fixture.root, 'bin/docker'));
    expect(runStaging().status).toBe(0);
    rmSync(join(fixture.root, 'bin/mv'));
    expect(runStaging().stderr).toContain('Runtime tool unavailable: mv');
    expect(runStaging().status).not.toBe(0);
  });

  it('uses the discovered Docker root rather than assuming home', () => {
    fixture.file('alternate-docker/data', 'fixture');
    fixture.file('docker-root', fixture.root + '/alternate-docker');
    expect(run().status).toBe(0);
    layout([1, 2, 3, 4], [999999, 999999, 999999, 3 * b + reserve - 1]);
    expect(run().stderr).toContain(fixture.root + '/alternate-docker requires');
  });

  it.each(['', 'relative', '/missing-directory'])('rejects invalid or missing Docker root %j', (root) => {
    fixture.file('docker-root', root.startsWith('/') ? fixture.root + root : root);
    expect(run().status).not.toBe(0);
  });

  it.each([run, runStaging])('budgets two move copies on equal-device bind mounts', (check) => {
    layout([1, 1, 2, 3], [2 * b + reserve, 2 * b + reserve, b + reserve, 3 * b + reserve]);
    expect(check().status).toBe(0);
    layout([1, 1, 2, 3], [2 * b + reserve - 1, 2 * b + reserve - 1, b + reserve, 3 * b + reserve]);
    expect(check().stderr).toContain('Insufficient runtime storage');
    expect(check().status).not.toBe(0);
  });

  it('admits the reported root/home capacities without needing prepared IO or inactive CODESYS', () => {
    fixture.file('plc', 'running');
    rmSync(join(fixture.root, WAGO_DOUT));
    rmSync(join(fixture.root, 'etc/rc.d/S99_zz_attraccess_wago'));
    expect(run().status).toBe(0);
    expect(existsSync(join(fixture.root, 'etc/attraccess-wago/install.lock'))).toBe(false);
    expect(existsSync(join(fixture.root, 'etc/attraccess-wago/delivery'))).toBe(false);
    expect(existsSync(join(fixture.root, 'vendor.log'))).toBe(false);
  });

  it.each([
    ['root', [1, 1, 1, 2], [2 * b + reserve - 1, 2 * b + reserve - 1, 2 * b + reserve - 1, 999999]],
    ['tmp', [1, 2, 3, 4], [999999, b + reserve - 1, 999999, 999999]],
    ['varlib', [1, 2, 3, 4], [999999, 999999, b + reserve - 1, 999999]],
    ['upload', [1, 2, 3, 4], [b + reserve - 1, 999999, 999999, 999999]],
    ['docker', [1, 2, 3, 4], [999999, 999999, 999999, 3 * b + reserve - 1]],
  ])('rejects insufficient %s capacity', (_name, devices, free) => {
    layout(devices as number[], free as number[]);
    expect(run().stderr).toContain('Insufficient runtime storage');
    expect(run().status).not.toBe(0);
  });

  // All partitions of E,T,V,D (full) and E,T,V (staging). Coefficients are
  // independent expected phase peaks, indexed by device rather than path.
  it.each([
    [
      [1, 2, 3, 4],
      [1, 1, 1, 3],
    ],
    [
      [1, 1, 2, 3],
      [2, 1, 3],
    ],
    [
      [1, 2, 1, 3],
      [1, 1, 3],
    ],
    [
      [1, 2, 3, 1],
      [3, 1, 1],
    ],
    [
      [1, 2, 2, 3],
      [1, 2, 3],
    ],
    [
      [1, 2, 3, 2],
      [1, 4, 1],
    ],
    [
      [1, 2, 3, 3],
      [1, 1, 4],
    ],
    [
      [1, 1, 2, 2],
      [2, 4],
    ],
    [
      [1, 2, 1, 2],
      [1, 4],
    ],
    [
      [1, 2, 2, 1],
      [3, 2],
    ],
    [
      [1, 1, 1, 2],
      [2, 3],
    ],
    [
      [1, 1, 2, 1],
      [4, 1],
    ],
    [
      [1, 2, 1, 1],
      [4, 1],
    ],
    [
      [1, 2, 2, 2],
      [1, 5],
    ],
    [[1, 1, 1, 1], [5]],
    [
      [1, 2, 3],
      [1, 1, 1],
    ],
    [
      [1, 1, 2],
      [2, 1],
    ],
    [
      [1, 2, 1],
      [1, 1],
    ],
    [
      [1, 2, 2],
      [1, 2],
    ],
    [[1, 1, 1], [2]],
  ])('enforces each filesystem peak for devices %j', (devices, coefficients) => {
    const check = devices.length === 4 ? run : runStaging;
    const free = devices.map((device) => coefficients[device - 1] * b + reserve);
    layout(devices, free);
    expect(check().status).toBe(0);
    for (const device of new Set(devices)) {
      layout(
        devices,
        free.map((value, index) => value - (devices[index] === device ? 1 : 0)),
      );
      expect(check().status).not.toBe(0);
    }
  });

  it.each([
    '',
    'fixture 999999 0 999999',
    dfHeader,
    dfHeader + 'fixture 999 0 nope 0% /',
    dfHeader + 'fixture 999 0 -1 0% /',
    dfHeader + 'fixture 999 0 1000 0% /',
    dfHeader + 'fixture 999 0 999 0% /\nextra',
  ])('fails closed for invalid df output %j', (output) => {
    fixture.file('bin/df', `#!${process.execPath}\nprocess.stdout.write(${JSON.stringify(output)});`, 0o700);
    expect(run().stderr).toContain('Invalid df output');
    expect(run().status).not.toBe(0);
  });

  it('does not mask a failing df with otherwise valid output', () => {
    fixture.file(
      'bin/df',
      `#!${process.execPath}\nconsole.log(${JSON.stringify(dfHeader + 'fixture 999999 0 999999 0% /')});process.exit(1);`,
      0o700,
    );
    expect(run().stderr).toContain('Cannot read storage capacity');
  });

  it('fails closed on unknown filesystem identity, missing tools and unavailable Docker', () => {
    fixture.file('bin/stat', '#!/bin/sh\nprintf "unknown\\n"\n', 0o700);
    expect(run().stderr).toContain('Cannot identify storage filesystem');
    fixture.file('bin/docker', '#!/bin/sh\nexit 1\n', 0o700);
    expect(run().status).not.toBe(0);
    rmSync(join(fixture.root, 'bin/flock'));
    expect(run().stderr).toContain('Runtime tool unavailable: flock');
  });

  it('retains the hardware check in the delivery preflight', () => {
    const script = runtimeBundlePreflightScript(bytes, fixture.root);
    expect(script).toContain(runtimeBundleCapacityPreflightScript(bytes, fixture.root));
    expect(script).toContain('codesys-active');
    expect(script).toContain('uid10001-access-denied');
  });

  it.each([run, runStaging])('uses validated native device/inode pairs when available', (check) => {
    fixture.file(
      'bin/stat',
      '#!/bin/sh\nif test "$1" = -c && test "$2" = "%u:%g:%a" && test "$3" = /; then printf "0:0:700\\n"; exit 0; fi\ntest "$1" = -Lc && test "$2" = "%d:%i" || exit 99\nprintf "1:123\\n"\n',
      0o700,
    );
    layout([1, 1, 1, 1], Array(4).fill(5 * b + reserve));
    expect(check().status).toBe(0);
  });

  it.each(['1', '1:bad', '1:2:3', '01:2', '1:18446744073709551616', '1:2\n1:2'])(
    'rejects malformed native identity %j in both standalone checks',
    (identity) => {
      fixture.file(
        'bin/stat',
        `#!${process.execPath}\nconst args=process.argv.slice(2);console.log(args[0]==='-c'&&args[1]==='%u:%g:%a'&&args[2]==='/'?'0:0:700':${JSON.stringify(identity)});`,
        0o700,
      );
      expect(run().stderr).toContain('Cannot identify storage filesystem');
      expect(runStaging().stderr).toContain('Cannot identify storage filesystem');
    },
  );

  it('requires the stat capture tool before checking capacity', () => {
    rmSync(join(fixture.root, 'bin/dd'));
    expect(runStaging().stderr).toContain('Runtime tool unavailable: dd');
    expect(run().stderr).toContain('Runtime tool unavailable: dd');
  });

  it.each([0, -1, NaN, Infinity, 1.5, 512 * mib + 1, Number.MAX_SAFE_INTEGER])(
    'rejects invalid byte size %s',
    (size) => {
      expect(() => runtimeBundleCapacityPreflightScript(size)).toThrow('Invalid bundle size');
      expect(() => runtimeBundleStagingCapacityPreflightScript(size)).toThrow('Invalid bundle size');
    },
  );
});
