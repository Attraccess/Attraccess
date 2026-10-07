import { mkdirSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { WAGO_DIN, WAGO_DOUT, wagoRuntimeBootScript } from '../wago-hardware-deployment';
import { fw31Model, fw31OsRelease, fw31Revisions } from './fw31-identity';
import { fw31MinimalOd } from './fw31-minimal-od';
export function setupFw31OperatingSystem({
  root,
  file,
  executable,
  statStyle,
}: {
  root: string;
  file: (path: string, content: string, mode?: number) => void;
  executable: (path: string, source: string) => void;
  statStyle: 'native' | 'terse';
}) {
  mkdirSync(join(root, 'bin'));

  for (const [name, path] of Object.entries({
    sh: '/bin/sh',
    cat: '/bin/cat',
    date: '/bin/date',
    cp: '/bin/cp',
    cmp: '/usr/bin/cmp',
    awk: '/usr/bin/awk',
    dd: '/bin/dd',
    mkdir: '/bin/mkdir',
    mktemp: '/usr/bin/mktemp',
    mkfifo: '/usr/bin/mkfifo',
    mv: '/bin/mv',
    chmod: '/bin/chmod',
    rm: '/bin/rm',
    touch: '/usr/bin/touch',
    grep: '/usr/bin/grep',
    wc: '/usr/bin/wc',
    tr: '/usr/bin/tr',
    sed: '/usr/bin/sed',
    head: '/usr/bin/head',
    du: '/usr/bin/du',
    sort: '/usr/bin/sort',
    base64: '/usr/bin/base64',
    openssl: '/usr/bin/openssl',
  }))
    symlinkSync(path, join(root, 'bin', name));

  file('bin/od', fw31MinimalOd, 0o700);

  for (const path of ['tmp', 'var/lib', 'home', 'etc/attraccess-wago', 'etc/rc.d/disabled'])
    mkdirSync(join(root, path), { recursive: true, mode: 0o700 });

  file('etc/passwd', 'root:x:0:0:root:/root:/bin/sh\n');

  file('etc/group', 'root:x:0:\n');

  file('etc/nsswitch.conf', 'passwd: files\ngroup: files\n');

  file('proc/self/uid_map', '0 0 4294967295\n');

  file('proc/self/gid_map', '0 0 4294967295\n');

  file('proc/self/mountinfo', '1 0 0:1 / / rw - ext4 fixture rw\n');

  file('proc/1/status', 'Uid:\t0\t0\t0\t0\nGid:\t0\t0\t0\t0\nGroups:\t0\n');

  file('proc/1/comm', 'init\n');

  file('proc/1/stat', '1 (init) S 0 ' + '0 '.repeat(17) + '1\n');

  file('proc/1/cgroup', '0::/\n');

  mkdirSync(join(root, 'proc/1/fd'));

  file('etc/os-release', fw31OsRelease);

  file('etc/REVISIONS', fw31Revisions);

  file('sys/firmware/devicetree/base/model', fw31Model);

  file('etc/specific/rtsversion', '0');

  file(WAGO_DIN, '5', 0o400);

  file(WAGO_DOUT, '2', 0o600);

  file('daemon', 'running');

  file('plc', 'stopped');

  file('containers.json', '[]');

  file('owners.json', JSON.stringify({ [WAGO_DIN]: '10001:10001', [WAGO_DOUT]: '10001:10001' }));

  file('etc/rc.d/S99_zz_attraccess_wago', wagoRuntimeBootScript(root), 0o700);

  file('bin/dockerd', '#!/bin/sh\nexit 99\n', 0o700);

  executable(
    'bin/sleep',
    `const fs=require('node:fs'),root=process.env.FIXTURE_ROOT;if(fs.readdirSync(root+'/etc/attraccess-wago').some(n=>n.startsWith('supervisor-start.')))Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,20);`,
  );

  file('bin/sync', '#!/bin/sh\nexit 0\n', 0o700);

  file(
    'bin/nohup',
    `#!/bin/sh
set -eu
umask 077
printf '%s\\n' "$*" >> "$FIXTURE_ROOT/supervisor.log"
test "\${FAULT:-}" != supervisor-launch-failed || exit 1
config="$FIXTURE_ROOT/etc/attraccess-wago"
if test ! -e "$config/supervisor.lock"; then (set -C; : > "$config/supervisor.lock") || exit 1; fi
exec 8<>"$config/supervisor.lock"
flock -n 8 || exit 1
touch "$FIXTURE_ROOT/supervisor-fixture-live"
trap 'rm -f "$FIXTURE_ROOT/supervisor-fixture-live"' EXIT
# Even the synthetic gate acknowledgement has a live owner and real flock
# lifetime when the stream test replaces flock with the OS implementation.
while :; do
  pending=0
  for request in "$config"/supervisor-start.*; do
    test -d "$request" || continue
    pending=1
    if test ! -e "$request/ready"; then (set -C; printf '%s\\n' "$$" > "$request/ready") || :; fi
  done
  test "$pending" = 1 || exit 0
  sleep 2
done
`,
    0o700,
  );

  file(
    'bin/df',
    '#!/bin/sh\necho "Filesystem 1024-blocks Used Available Capacity Mounted on"\nif [ "$FAULT" = storage ]; then echo "disk 100 99 1 99% /fixture"; else echo "disk 999999 0 999999 0% /fixture"; fi\n',
    0o700,
  );

  file(
    'bin/tar',
    '#!/bin/sh\nif [ "$1" = --version ]; then echo "GNU tar fixture"; exit 0; fi\nshift 2\nexec /usr/bin/tar "$@"\n',
    0o700,
  );

  executable(
    'bin/readlink',
    `if(process.env.FAULT==='readlink-failed')process.exit(1);const fs=require('node:fs');console.log(process.argv.includes('-f')?fs.realpathSync(process.argv.at(-1)):fs.readlinkSync(process.argv.at(-1)));`,
  );

  executable(
    'bin/stat',
    `
const fs=require('node:fs'),root=process.env.FIXTURE_ROOT,args=process.argv.slice(2),p=args.at(-1);
// Standalone/nested helpers probe /. Observe the fixture root, never the host root.
const observedPath=p==='/'?root:p;
const terse=${JSON.stringify(statStyle)}==='terse';
if(terse&&args[0]==='--help'){console.log('BusyBox v1.37.0 () multi-call binary.\\nUsage: stat [-ltf] FILE...');process.exit(0);}
if(terse&&!['-t','-Lt'].includes(args[0]))process.exit(1);
if(observedPath!==root&&!observedPath.startsWith(root+'/'))process.exit(99);
const s=args[0].includes('L')?fs.statSync(observedPath):fs.lstatSync(observedPath),owners=JSON.parse(fs.readFileSync(root+'/owners.json','utf8'));
const owner=(owners[observedPath.slice(root.length)]||'0:0').split(':'),mode=(s.mode&0o7777).toString(8);
const values={'%s':s.size,'%u':owner[0],'%g':owner[1],'%a':mode,'%h':s.nlink,'%d':s.dev,'%i':s.ino};
if(terse){console.log(p+' '+[s.size,s.blocks,s.mode.toString(16),...owner,s.dev.toString(16),s.ino,s.nlink,0,0,1,1,1,s.blksize].join(' '));process.exit(0);}
console.log(args[1].replace(/%[sugahdi]/g,v=>values[v]));`,
  );

  executable(
    'etc/config-tools/get_filesystem_data',
    `if(process.argv[2]!=='active-partition-medium')process.exit(99);console.log(process.env.FAULT==='sd-card'?'sd-card':'internal-flash');`,
  );
}
