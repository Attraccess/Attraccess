import { spawnSync } from 'node:child_process';
import { linkSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { wagoHostIoGuardShell } from './wago-host-io-guard';

const containerId = 'a'.repeat(64);

/** Real isolated inodes with synthetic Linux proc records. No host process,
 * account, permission, Docker daemon or network is accessed by the guard.
 */
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'wago-host-io-'));
  const file = (path: string, content: string, mode = 0o600) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content, { mode });
  };
  const executable = (path: string, content: string) => file(path, `#!${process.execPath}\n${content}`, 0o700);
  file('etc/passwd', 'root:x:0:0:root:/root:/bin/sh\n');
  file('etc/group', 'root:x:0:\n');
  file('proc/self/uid_map', '0 0 4294967295\n');
  file('proc/self/gid_map', '0 0 4294967295\n');
  file('dout', '0');
  file(
    'docker-state.json',
    JSON.stringify({ id: '', pid: 0, running: false, security: ['name=seccomp,profile=builtin'] }),
  );
  const processRecord = (pid: number, status = 'Uid: 0 0 0 0\nGid: 0 0 0 0\nGroups: 0\n', cgroup = '0::/\n') => {
    file(`proc/${pid}/stat`, `${pid} (process (with spaces)) S ${Array(18).fill('0').join(' ')} 1234\n`);
    file(`proc/${pid}/status`, status);
    file(`proc/${pid}/cgroup`, cgroup);
    file(`proc/${pid}/uid_map`, '0 0 4294967295\n');
    file(`proc/${pid}/gid_map`, '0 0 4294967295\n');
    mkdirSync(join(root, `proc/${pid}/fd`), { recursive: true });
  };
  const fd = (pid: number, flags: string, path = 'dout') => {
    symlinkSync(join(root, path), join(root, `proc/${pid}/fd/5`));
    file(`proc/${pid}/fdinfo/5`, `pos:\t0\nflags:\t${flags}\n`);
  };
  processRecord(1);
  mkdirSync(join(root, 'bin'));
  executable(
    'bin/awk',
    `const fs=require('node:fs'),cp=require('node:child_process'),args=process.argv.slice(2),p=args.at(-1),root=process.env.FIXTURE_ROOT;
if(process.env.FAULT==='process-disappears'&&p===root+'/proc/22/stat'){fs.rmSync(root+'/proc/22',{recursive:true,force:true});process.exit(1);}
if(process.env.FAULT==='status-unreadable'&&p===root+'/proc/22/status')process.exit(1);
const r=cp.spawnSync('/usr/bin/awk',args,{stdio:'inherit'});process.exit(r.status ?? 1);`,
  );
  executable(
    'bin/stat',
    `const fs=require('node:fs'),args=process.argv.slice(2),root=process.env.FIXTURE_ROOT,p=args.at(-1);
if(args[0]!=='-Lc'||args[1]!=='%d:%i'||!p.startsWith(root+'/'))process.exit(99);
if(p===root+'/proc/22/fd/5'){
 if(process.env.FAULT==='fd-disappears'){fs.rmSync(p);process.exit(1);}
 if(process.env.FAULT==='fd-unreadable')process.exit(1);
}
try{const s=fs.statSync(p,{bigint:true});console.log(s.dev+':'+s.ino);}catch{process.exit(1);}`,
  );
  executable(
    'bin/docker',
    `const fs=require('node:fs'),args=process.argv.slice(2),root=process.env.FIXTURE_ROOT,s=JSON.parse(fs.readFileSync(root+'/docker-state.json','utf8'));
if(process.env.FAULT==='docker-query-failed')process.exit(1);
if(args.join(' ')==="info --format {{json .SecurityOptions}}")console.log(JSON.stringify(s.security));
else if(args.join(' ')==="container ls -a --no-trunc --filter name=^/attraccess-wago$ --format {{.ID}}")console.log(s.id);
else if(args.join(' ')==="inspect --format {{.Id}} {{.State.Pid}} {{.State.Running}} {{.HostConfig.UsernsMode}} "+s.id)console.log(s.id+' '+s.pid+' '+s.running+' '+(s.userns||''));
else process.exit(99);`,
  );
  const state = (overrides: Record<string, unknown>) =>
    file('docker-state.json', JSON.stringify({ id: '', pid: 0, running: false, security: [], ...overrides }));
  return {
    root,
    file,
    processRecord,
    fd,
    state,
    run: (allowOwned = false, fault = '') =>
      spawnSync(
        '/bin/sh',
        [
          '-c',
          `set -eu\nroot="$FIXTURE_ROOT"\ndout="$root/dout"\n${wagoHostIoGuardShell()}\nif wago_host_io_guard ${allowOwned ? 'allow-owned' : ''}; then printf 'clear\\n'; else printf '%s\\n' "$host_io_guard_reason"; exit 1; fi`,
        ],
        {
          encoding: 'utf8',
          timeout: 10000,
          env: { FIXTURE_ROOT: root, PATH: join(root, 'bin'), FAULT: fault },
        },
      ),
    dispose: () => rmSync(root, { recursive: true, force: true }),
  };
}

describe('host digital output and identity guard', () => {
  let host: ReturnType<typeof fixture>;
  beforeEach(() => (host = fixture()));
  afterEach(() => host.dispose());

  function rejected(reason: string, allowOwned = false, fault = '') {
    const result = host.run(allowOwned, fault);
    expect({ status: result.status, stdout: result.stdout, stderr: result.stderr }).toEqual({
      status: 1,
      stdout: `${reason}\n`,
      stderr: '',
    });
  }

  it('admits an unused numeric identity with no direct output writers', () => {
    expect(host.run().status).toBe(0);
  });

  it.each([
    ['etc/passwd', 'unrelated:x:10001:20000::/:/bin/sh\n'],
    ['etc/passwd', 'unrelated:x:20000:10001::/:/bin/sh\n'],
    ['etc/group', 'unrelated:x:10001:\n'],
  ])('rejects host identity ownership in %s', (path, content) => {
    host.file(path, content);
    rejected('runtime-identity-conflict');
  });

  it.each(['Uid', 'Gid'])('rejects every real, effective, saved and filesystem %s collision', (field) => {
    for (let index = 0; index < 4; index++) {
      const values = Array(4).fill('0');
      values[index] = '10001';
      host.processRecord(
        22,
        `Uid: ${field === 'Uid' ? values.join(' ') : '0 0 0 0'}\nGid: ${field === 'Gid' ? values.join(' ') : '0 0 0 0'}\nGroups: 0\n`,
      );
      rejected('runtime-identity-conflict');
    }
  });

  it('rejects a supplementary group collision', () => {
    host.processRecord(22, 'Uid: 50 50 50 50\nGid: 50 50 50 50\nGroups: 50 10001\n');
    rejected('runtime-identity-conflict');
  });

  it('fails closed for an unobservable host account database or alternate NSS source', () => {
    host.file('etc/nsswitch.conf', 'passwd: files ldap\ngroup: files\n');
    rejected('host-io-observation-failed');
    rmSync(join(host.root, 'etc/nsswitch.conf'));
    rmSync(join(host.root, 'etc/group'));
    rejected('host-io-observation-failed');
  });

  it.each(['name=userns', 'name=rootless'])('rejects Docker identity translation %s', (security) => {
    host.state({ security: [security] });
    rejected('runtime-userns-unsupported');
  });

  it.each(['uid_map', 'gid_map'])('rejects a remapped host execution %s', (map) => {
    host.file(`proc/self/${map}`, '0 100000 65536\n');
    rejected('runtime-userns-unsupported');
  });

  it.each(['0100001', '0100002'])('rejects an existing open output descriptor with octal flags %s', (flags) => {
    host.processRecord(22);
    host.fd(22, flags);
    rejected('output-host-process-conflict');
  });

  it('matches a writable descriptor by inode through a different hard-link pathname', () => {
    linkSync(join(host.root, 'dout'), join(host.root, 'unrelated-name'));
    host.processRecord(22);
    host.fd(22, '0100001', 'unrelated-name');
    rejected('output-host-process-conflict');
  });

  it('permits read-only descriptors and unrelated writable files', () => {
    host.processRecord(22);
    host.fd(22, '0100000');
    host.file('other-file', '');
    host.processRecord(23);
    host.fd(23, '0100002', 'other-file');
    expect(host.run().status).toBe(0);
  });

  it.each(['8', 'invalid', '0100003'])('fails closed for invalid output descriptor flags %s', (flags) => {
    host.processRecord(22);
    host.fd(22, flags);
    rejected('host-io-observation-failed');
  });

  it('fails closed when a live output descriptor cannot be observed', () => {
    host.processRecord(22);
    host.fd(22, '0100001');
    rejected('host-io-observation-failed', false, 'fd-unreadable');
  });

  it('fails closed when a live output descriptor has missing or ambiguous access flags', () => {
    host.processRecord(22);
    host.fd(22, '0100001');
    host.file('proc/22/fdinfo/5', 'pos: 0\n');
    rejected('host-io-observation-failed');
    host.file('proc/22/fdinfo/5', 'flags: 0100000\nflags: 0100001\n');
    rejected('host-io-observation-failed');
  });

  it('allows a descriptor that closed during observation after proving its absence', () => {
    host.processRecord(22);
    host.fd(22, '0100001');
    expect(host.run(false, 'fd-disappears').status).toBe(0);
  });

  it('allows a process that exited during observation after proving its absence', () => {
    host.processRecord(22);
    expect(host.run(false, 'process-disappears').status).toBe(0);
  });

  it('fails closed for a live process whose identity cannot be read', () => {
    host.processRecord(22);
    rejected('host-io-observation-failed', false, 'status-unreadable');
  });

  it('fails closed when Docker namespace evidence is unavailable', () => {
    rejected('host-io-observation-failed', false, 'docker-query-failed');
  });

  function owned(cgroup = `0::/system.slice/docker-${containerId}.scope\n`) {
    host.state({ id: containerId, pid: 22, running: true });
    host.processRecord(22, 'Uid: 10001 10001 10001 10001\nGid: 10001 10001 10001 10001\nGroups:\n', cgroup);
    host.fd(22, '0100002');
  }

  it('permits the fully verified existing runtime only when explicitly requested', () => {
    owned();
    expect(host.run(true).status).toBe(0);
    rejected('runtime-identity-conflict');
  });

  it('permits verified container descendants and cgroup-v1 Docker membership', () => {
    owned(`11:memory:/docker/${containerId}\n10:cpu,cpuacct:/docker/${containerId}\n`);
    host.processRecord(
      23,
      'Uid: 10001 10001 10001 10001\nGid: 10001 10001 10001 10001\nGroups:\n',
      `11:memory:/docker/${containerId}/child\n10:cpu,cpuacct:/docker/${containerId}/child\n`,
    );
    host.fd(23, '0100001');
    expect(host.run(true).status).toBe(0);
  });

  it('does not exempt another host process when the owned runtime exists', () => {
    owned();
    host.processRecord(23);
    host.fd(23, '0100001');
    rejected('output-host-process-conflict', true);
  });

  it('requires full container identity and exact cgroup path components', () => {
    owned(`0::/system.slice/docker-${containerId}f.scope\n`);
    rejected('host-io-observation-failed', true);
    host.state({ id: containerId.slice(0, 12), pid: 22, running: true });
    rejected('host-io-observation-failed', true);
  });

  it('rejects a remapped owned runtime despite its matching cgroup', () => {
    owned();
    host.file('proc/22/uid_map', '0 100000 65536\n');
    rejected('host-io-observation-failed', true);
  });

  it('allows a stopped owned container but grants it no live process exemption', () => {
    host.state({ id: containerId, pid: 0, running: false });
    expect(host.run(true).status).toBe(0);
    host.processRecord(22, 'Uid: 10001 10001 10001 10001\nGid: 0 0 0 0\nGroups:\n');
    rejected('runtime-identity-conflict', true);
  });

  it('revalidates identity ownership and new direct writers on subsequent gates', () => {
    owned();
    expect(host.run(true).status).toBe(0);
    host.file('etc/group', 'unrelated:x:10001:\n');
    rejected('runtime-identity-conflict', true);
    host.file('etc/group', 'root:x:0:\n');
    host.processRecord(23);
    host.fd(23, '0100001');
    rejected('output-host-process-conflict', true);
  });
});
