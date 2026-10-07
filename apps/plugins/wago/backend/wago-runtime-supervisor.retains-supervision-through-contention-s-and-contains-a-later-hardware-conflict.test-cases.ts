import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { fw31ShellFixture } from './fixtures/fw31-shell-fixture';
import { wagoRuntimeSupervisorLaunchShell } from './wago-runtime-supervisor';
import type { RuntimeSupervisorHandoffWithRealAdvisoryLocksAndProcessesTestScope } from './wago-runtime-supervisor.spec';
export function registerRetainsSupervisionThroughContentionSAndContainsALaterHardwareConflict(
  _scope: RuntimeSupervisorHandoffWithRealAdvisoryLocksAndProcessesTestScope,
): void {
  it.each([14, 15])(
    'retains supervision through contention %s and contains a later hardware conflict',
    async (contention) => {
      const fixture = fw31ShellFixture();
      fixture.file(
        'bin/timeout',
        fixture.read('bin/timeout').replace("['10','30','45']", "['10','30','45','300']"),
        0o700,
      );
      const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
      const waitFor = async (check: () => boolean) => {
        // Loaded runners spawn each fixture shim through node; a tight deadline
        // turns contention into spurious failures instead of catching real hangs.
        const deadline = Date.now() + 240000;
        while (!check()) {
          if (Date.now() > deadline) throw new Error('Fixture process deadline exceeded');
          await delay(20);
        }
      };
      fixture.file(
        'bin/flock',
        `#!${process.env.PYTHON || '/usr/bin/python3'}
import fcntl, sys, os
try: fcntl.flock(int(sys.argv[2]), fcntl.LOCK_UN if sys.argv[1] == '-u' else fcntl.LOCK_EX | fcntl.LOCK_NB)
except OSError:
 if sys.argv[2] == '9':
  with open(os.environ['FIXTURE_ROOT'] + '/busy', 'a') as log: log.write('busy\\n')
 sys.exit(1)
`,
        0o700,
      );
      fixture.file('bin/nohup', '#!/bin/sh\nexec /usr/bin/nohup "$@"\n', 0o700);
      // Only the old owner's polling sleeps are controlled. Locks, process exit,
      // inherited descriptors and the generated gate/handoff all remain real.
      fixture.file(
        'bin/sleep',
        `#!${process.execPath}
const fs=require('node:fs'),root=process.env.FIXTURE_ROOT;
if(fs.existsSync(root+'/owner-pid') && Number(fs.readFileSync(root+'/owner-pid','utf8'))===process.ppid){
 const count=fs.existsSync(root+'/sleeps')?Number(fs.readFileSync(root+'/sleeps','utf8'))+1:1;
 fs.writeFileSync(root+'/sleeps',String(count));
  if(count>=14 && !fs.existsSync(root+'/allow-polling')){
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
`,
        0o700,
      );
      fixture.file(
        'owner',
        '#!/bin/sh\necho $$ > "$FIXTURE_ROOT/owner-pid"\nexec "$FIXTURE_ROOT/etc/rc.d/S99_zz_attraccess_wago" supervise\n',
        0o700,
      );
      fixture.file('etc/attraccess-wago/runtime-enabled', '');
      fixture.file('etc/attraccess-wago/install.lock', '');
      fixture.setContainers([{ id: 'owned', name: 'attraccess-wago', running: true, restart: 'no' }]);
      const child = spawn(
        '/bin/sh',
        [
          '-c',
          `set -eu
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
`,
        ],
        {
          detached: true,
          env: { PATH: join(fixture.root, 'bin'), FIXTURE_ROOT: fixture.root, TMPDIR: join(fixture.root, 'tmp') },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      let output = '';
      child.stdout.on('data', (data) => (output += data));
      child.stderr.on('data', (data) => (output += data));
      let status: number | null | undefined;
      child.on('close', (code) => (status = code));
      try {
        await waitFor(() => existsSync(join(fixture.root, 'sleep-14')));
        if (contention === 15) {
          fixture.file('release-14', '');
          await waitFor(() => existsSync(join(fixture.root, 'sleep-15')));
          expect(
            fixture.run('exec 8<>"$FIXTURE_ROOT/etc/attraccess-wago/supervisor.lock"\nflock -n 8').status,
          ).not.toBe(0);
        }
        fixture.file('trigger', '');
        // Pause at the launcher's actual poll, after its lock-release step, not
        // merely after mkdir (the caller could still be preparing the handoff).
        await waitFor(() => existsSync(join(fixture.root, 'launcher-waiting')));
        fixture.file('release-14', '');
        if (contention === 15) fixture.file('release-15', '');
        if (contention === 14)
          await waitFor(
            () =>
              existsSync(join(fixture.root, 'sleep-15')) ||
              fixture.run('exec 8<>"$FIXTURE_ROOT/etc/attraccess-wago/supervisor.lock"\nflock -n 8').status === 0,
          );
        fixture.file('release-launch', '');
        await waitFor(() => status !== undefined);
        expect({ status, output }).toEqual({ status: 0, output: 'launched\n' });
        expect(fixture.run('exec 8<>"$FIXTURE_ROOT/etc/attraccess-wago/supervisor.lock"\nflock -n 8').status).not.toBe(
          0,
        );
        expect(fixture.containers()[0].running).toBe(true);
        fixture.file('plc', 'running');
        fixture.file('allow-polling', '');
        fixture.file('release-15', '');
        fixture.file('release-16', '');
        await waitFor(() => !fixture.containers()[0].running);
        expect(existsSync(join(fixture.root, 'etc/attraccess-wago/runtime-enabled'))).toBe(true);
      } finally {
        for (const signal of ['SIGTERM', 'SIGKILL'] as const) {
          try {
            if (child.pid) process.kill(-child.pid, signal);
          } catch {
            /* Only this fixture's process group. */
          }
          await delay(50);
        }
        fixture.dispose();
      }
    },
    600000,
  );
}
