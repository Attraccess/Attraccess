import { chmodSync, existsSync, linkSync, readdirSync, rmSync, statSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fw31ShellFixture } from './fixtures/fw31-shell-fixture';
import { wagoRuntimeSupervisorAcknowledgeShell, wagoRuntimeSupervisorLaunchShell } from './wago-runtime-supervisor';

describe('bounded runtime supervisor launch acknowledgement', () => {
  let fixture: ReturnType<typeof fw31ShellFixture>;
  const config = 'etc/attraccess-wago';
  const request = config + '/supervisor-start.fixture';
  const script = (body: string) => `set -eu
umask 077
config='${fixture.root}/${config}'
hook='${fixture.root}/etc/rc.d/S99_zz_attraccess_wago'
fail() { echo "$*" >&2; exit 1; }
exec 9<>"$config/install.lock"
flock -n 9
set -- "$config"/supervisor-start.*
${body}`;
  const requests = () => readdirSync(join(fixture.root, config)).filter((name) => name.startsWith('supervisor-start.'));
  const owner = (path: string, value: string) =>
    fixture.file('owners.json', JSON.stringify({ ...JSON.parse(fixture.read('owners.json')), ['/' + path]: value }));

  beforeEach(() => {
    fixture = fw31ShellFixture();
    fixture.file(config + '/install.lock', '');
    fixture.file(config + '/runtime-enabled', '');
    fixture.file(config + '/supervisor.lock', '');
    // The test clock still yields to the detached launcher before each poll.
    fixture.file(
      'bin/sleep',
      `#!${process.execPath}\nAtomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,50);\n`,
      0o700,
    );
    fixture.file(
      'bin/nohup',
      `#!${process.execPath}
const fs=require('node:fs'),root=process.env.FIXTURE_ROOT,config=root+'/${config}',fault=process.env.FAULT;
fs.appendFileSync(root+'/launches','launch\\n');
if(fault==='supervisor-launch-failed')process.exit(1);
fs.writeFileSync(root+'/supervisor-fixture-live','');
for(const name of fs.readdirSync(config).filter(name=>name.startsWith('supervisor-start.'))){
 const ready=config+'/'+name+'/ready';
 if(fs.existsSync(ready))continue;
 if(fault==='unsafe-ack')fs.symlinkSync(root+'/target',ready);
 else fs.writeFileSync(ready,fault==='dead-ack'?'99999999':String(process.ppid),{mode:0o600});
}
if(fault==='stale-ack')fs.rmSync(root+'/supervisor-fixture-live');
`,
      0o700,
    );
  });
  afterEach(() => fixture.dispose());

  it('confirms a live supervisor and removes only its acknowledged private request', () => {
    expect(fixture.run(script(wagoRuntimeSupervisorLaunchShell())).status).toBe(0);
    expect(requests()).toEqual([]);
    expect(fixture.read('launches').trim().split('\n').length).toBeLessThanOrEqual(15);
  });

  it('fails after bounded launch attempts without an acknowledgement and removes its request', () => {
    const result = fixture.run(script(wagoRuntimeSupervisorLaunchShell()), 'supervisor-launch-failed');
    expect(result.stderr).toContain('Runtime supervisor launch unverified');
    expect(result.status).not.toBe(0);
    expect(requests()).toEqual([]);
    expect(fixture.read('launches').trim().split('\n')).toHaveLength(15);
  });

  it('accepts an existing supervisor acknowledgement when the second launch cannot acquire ownership', () => {
    fixture.file(
      'bin/sleep',
      `#!${process.execPath}
const fs=require('node:fs'),config=process.env.FIXTURE_ROOT+'/${config}';
fs.writeFileSync(process.env.FIXTURE_ROOT+'/supervisor-fixture-live','');
for(const name of fs.readdirSync(config).filter(name=>name.startsWith('supervisor-start.')))
 fs.writeFileSync(config+'/'+name+'/ready',String(process.ppid),{mode:0o600});
`,
      0o700,
    );
    expect(fixture.run(script(wagoRuntimeSupervisorLaunchShell()), 'supervisor-launch-failed').status).toBe(0);
    expect(requests()).toEqual([]);
  });

  it('rejects a symlinked launch acknowledgement without touching its target', () => {
    fixture.file('target', 'preserve target');
    expect(fixture.run(script(wagoRuntimeSupervisorLaunchShell()), 'unsafe-ack').status).not.toBe(0);
    expect(fixture.read('target')).toBe('preserve target');
    expect(requests()).toEqual([]);
  });

  it.each(['stale-ack', 'dead-ack'])('rejects a receipt without a live lock owner: %s', (fault) => {
    expect(fixture.run(script(wagoRuntimeSupervisorLaunchShell()), fault).status).not.toBe(0);
    expect(requests()).toEqual([]);
  });

  it('defers interruption during handoff until the caller can run its locked rollback', () => {
    fixture.file('bin/sleep', `#!${process.execPath}\nprocess.kill(process.ppid,'SIGTERM');\n`, 0o700);
    const result = fixture.run(script(`trap ': >&9 && echo rollback-with-lock' EXIT\n${wagoRuntimeSupervisorLaunchShell()}`));
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('rollback-with-lock\n');
    expect(requests()).toEqual([]);
  });

  it('publishes a private regular acknowledgement and accepts a repeated observation', () => {
    fixture.file(request + '/request', '');
    const acknowledge = script(wagoRuntimeSupervisorAcknowledgeShell());
    expect(fixture.run(acknowledge).status).toBe(0);
    expect(statSync(join(fixture.root, request, 'ready')).mode & 0o777).toBe(0o600);
    expect(fixture.run(acknowledge).status).toBe(0);
    expect(readdirSync(join(fixture.root, request))).toEqual(['ready', 'request']);
  });

  it('does not acknowledge a request that arrived after the gate began', () => {
    fixture.file(request + '/request', '');
    expect(fixture.run(script(`set -- "$config/supervisor-start.earlier"\n${wagoRuntimeSupervisorAcknowledgeShell()}`)).status).toBe(0);
    expect(existsSync(join(fixture.root, request, 'ready'))).toBe(false);
  });

  it('allows the caller to consume its request immediately after the acknowledgement is published', () => {
    fixture.file(request + '/request', '');
    rmSync(join(fixture.root, 'bin/mv'));
    fixture.file(
      'bin/mv',
      `#!${process.execPath}
const fs=require('node:fs'),root=process.env.FIXTURE_ROOT,args=process.argv.slice(2);
if(args.at(-1)!==root+'/${request}/ready')process.exit(99);
const moved=require('node:child_process').spawnSync('/bin/mv',args);
if(moved.status!==0)process.exit(1);
fs.rmSync(root+'/${request}',{recursive:true});
`,
      0o700,
    );
    expect(fixture.run(script(wagoRuntimeSupervisorAcknowledgeShell())).status).toBe(0);
    expect(requests()).toEqual([]);
  });

  it.each(['directory-owner', 'directory-mode', 'ready-owner', 'ready-mode', 'ready-symlink', 'ready-hardlink'])(
    'rejects unsafe acknowledgement metadata: %s',
    (fault) => {
      fixture.file(request + '/request', '');
      if (fault === 'directory-owner') owner(request, '10001:10001');
      if (fault === 'directory-mode') chmodSync(join(fixture.root, request), 0o777);
      if (fault === 'ready-owner' || fault === 'ready-mode') fixture.file(request + '/ready', '');
      if (fault === 'ready-owner') owner(request + '/ready', '10001:10001');
      if (fault === 'ready-mode') chmodSync(join(fixture.root, request, 'ready'), 0o666);
      if (fault === 'ready-symlink' || fault === 'ready-hardlink') {
        fixture.file('target', 'preserve target');
        const link = fault === 'ready-symlink' ? symlinkSync : linkSync;
        link(join(fixture.root, 'target'), join(fixture.root, request, 'ready'));
      }
      expect(fixture.run(script(wagoRuntimeSupervisorAcknowledgeShell())).status).not.toBe(0);
      if (existsSync(join(fixture.root, 'target'))) expect(fixture.read('target')).toBe('preserve target');
    },
  );

  it('rejects a request directory symlink without creating an acknowledgement at its target', () => {
    fixture.file('target/value', 'preserve target');
    symlinkSync(join(fixture.root, 'target'), join(fixture.root, request));
    expect(fixture.run(script(wagoRuntimeSupervisorAcknowledgeShell())).status).not.toBe(0);
    expect(existsSync(join(fixture.root, 'target/ready'))).toBe(false);
  });
});

describe('runtime supervisor handoff with real advisory locks and processes', () => {
  it.each([14, 15])('retains supervision or contains failure when launch arrives at contention %s', async (contention) => {
    const fixture = fw31ShellFixture();
    const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
    const waitFor = async (check: () => boolean) => {
      const deadline = Date.now() + 60000;
      while (!check()) {
        if (Date.now() > deadline) throw new Error('Fixture process deadline exceeded');
        await delay(20);
      }
    };
    fixture.file('bin/flock', `#!${process.env.PYTHON || '/usr/bin/python3'}
import fcntl, sys, os
try: fcntl.flock(int(sys.argv[2]), fcntl.LOCK_UN if sys.argv[1] == '-u' else fcntl.LOCK_EX | fcntl.LOCK_NB)
except OSError:
 if sys.argv[2] == '9':
  with open(os.environ['FIXTURE_ROOT'] + '/busy', 'a') as log: log.write('busy\\n')
 sys.exit(1)
`, 0o700);
    fixture.file('bin/nohup', '#!/bin/sh\nexec /usr/bin/nohup "$@"\n', 0o700);
    // Only the old owner's polling sleeps are controlled. Locks, process exit,
    // inherited descriptors and the generated gate/handoff all remain real.
    fixture.file('bin/sleep', `#!${process.execPath}
const fs=require('node:fs'),root=process.env.FIXTURE_ROOT;
if(fs.existsSync(root+'/owner-pid') && Number(fs.readFileSync(root+'/owner-pid','utf8'))===process.ppid){
 const count=fs.existsSync(root+'/sleeps')?Number(fs.readFileSync(root+'/sleeps','utf8'))+1:1;
 fs.writeFileSync(root+'/sleeps',String(count));
 if(count>=14){
  fs.writeFileSync(root+'/sleep-'+count,'');
  while(!fs.existsSync(root+'/release-'+count))Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10);
 }
}else {
 if(fs.readdirSync(root+'/etc/attraccess-wago').some(name=>name.startsWith('supervisor-start.'))){
  fs.writeFileSync(root+'/launcher-waiting','');
  while(!fs.existsSync(root+'/release-launch'))Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,10);
 }
 Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,50);
}
`, 0o700);
    fixture.file('owner', '#!/bin/sh\necho $$ > "$FIXTURE_ROOT/owner-pid"\nexec "$FIXTURE_ROOT/etc/rc.d/S99_zz_attraccess_wago" supervise\n', 0o700);
    fixture.file('etc/attraccess-wago/runtime-enabled', '');
    fixture.file('etc/attraccess-wago/install.lock', '');
    fixture.setContainers([{ id: 'owned', name: 'attraccess-wago', running: true, restart: 'no' }]);
    const child = spawn('/bin/sh', ['-c', `set -eu
umask 077
config="$FIXTURE_ROOT/etc/attraccess-wago"
hook="$FIXTURE_ROOT/etc/rc.d/S99_zz_attraccess_wago"
fail() { echo "$*" >&2; exit 1; }
exec 9<>"$config/install.lock"
flock -n 9
"$FIXTURE_ROOT/owner" </dev/null >/dev/null 2>&1 9>&- &
while test ! -f "$FIXTURE_ROOT/trigger"; do sleep 2; done
${wagoRuntimeSupervisorLaunchShell()}
echo launched
`], {
      detached: true,
      env: { PATH: join(fixture.root, 'bin'), FIXTURE_ROOT: fixture.root, TMPDIR: join(fixture.root, 'tmp') },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (data) => (output += data));
    child.stderr.on('data', (data) => (output += data));
    let status: number | null | undefined;
    child.on('close', (code) => (status = code));
    try {
      await waitFor(() => existsSync(join(fixture.root, 'sleep-14')));
      if (contention === 15) {
        fixture.file('release-14', '');
        // The 16th failed acquisition is the exhausted owner's containment
        // path. It must keep supervisor.lock while waiting for the transaction.
        await waitFor(() => fixture.read('busy').trim().split('\n').length >= 16);
        expect(fixture.run('exec 8<>"$FIXTURE_ROOT/etc/attraccess-wago/supervisor.lock"\nflock -n 8').status).not.toBe(0);
        fixture.file('release-launch', '');
      }
      fixture.file('trigger', '');
      // Pause at the launcher's actual poll, after its lock-release step, not
      // merely after mkdir (the caller could still be preparing the handoff).
      await waitFor(() => existsSync(join(fixture.root, 'launcher-waiting')));
      fixture.file('release-14', '');
      if (contention === 14) await waitFor(() => existsSync(join(fixture.root, 'sleep-15')) ||
        fixture.run('exec 8<>"$FIXTURE_ROOT/etc/attraccess-wago/supervisor.lock"\nflock -n 8').status === 0);
      fixture.file('release-launch', '');
      await waitFor(() => status !== undefined);
      if (contention === 15) {
        expect(status).toBe(1);
        expect(output).toContain('Runtime supervisor launch unverified');
        expect(fixture.containers()[0].running).toBe(false);
        expect(existsSync(join(fixture.root, 'etc/attraccess-wago/runtime-enabled'))).toBe(false);
        return;
      }
      expect({ status, output }).toEqual({ status: 0, output: 'launched\n' });
      expect(fixture.run('exec 8<>"$FIXTURE_ROOT/etc/attraccess-wago/supervisor.lock"\nflock -n 8').status).not.toBe(0);
      expect(fixture.containers()[0].running).toBe(true);
      fixture.file('plc', 'running');
      fixture.file('release-15', '');
      await waitFor(() => !fixture.containers()[0].running);
      expect(existsSync(join(fixture.root, 'etc/attraccess-wago/runtime-enabled'))).toBe(false);
    } finally {
      for (const signal of ['SIGTERM', 'SIGKILL'] as const) {
        try { if (child.pid) process.kill(-child.pid, signal); } catch { /* Only this fixture's process group. */ }
        await delay(50);
      }
      fixture.dispose();
    }
  }, 120000);
});
