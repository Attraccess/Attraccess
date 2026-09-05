import { spawn, spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  runtimeBundleAcceptScript,
  runtimeBundleDeliveryScript,
  runtimeBundleRecoveryAcknowledgementScript,
  runtimeBundleStreamReceiver,
  runtimeBundleInstallScript,
  runtimeBundleRecoveryScript,
} from './wago-runtime-install';

const image = `example.invalid/runtime@sha256:${'a'.repeat(64)}`;
type Container = { id: string; name: string; running: boolean };

describe('runtime install shell transaction (no Docker daemon or network)', () => {
  let root: string;
  let config: string;
  let data: string;
  let tx: string;

  const write = (path: string, text: string) => writeFileSync(path, text, { mode: 0o600 });
  const containers = (): Container[] => JSON.parse(readFileSync(join(root, 'docker.json'), 'utf8'));
  const run = (script: string, fault = '', input?: Buffer) =>
    // Keep a shell parent for fault helpers even when the generated script ends
    // in an external command (some shells otherwise exec that final command).
    spawnSync('/bin/sh', ['-c', `${script}\nstatus=$?\nexit "$status"`], {
      encoding: 'utf8',
      input,
      timeout: 10000,
      env: {
        ...process.env,
        PATH: `${root}/bin:${process.env.PATH}`,
        FIXTURE_ROOT: root,
        TMPDIR: join(root, 'tmp'),
        FAULT: fault,
      },
    });
  const install = (fault = '') => run(runtimeBundleInstallScript(image, root), fault);
  const recover = (fault = '') => run(runtimeBundleRecoveryScript(root), fault);
  const prior = (running = true) => {
    write(join(root, 'docker.json'), JSON.stringify([{ id: 'old-id', name: 'attraccess-wago', running }]));
    mkdirSync(data);
    write(join(data, 'credentials.json'), 'revoked-old-credentials');
    write(join(config, 'runtime.env'), 'OLD=secret');
  };

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'wago-runtime-fixture-'));
    config = join(root, 'etc/attraccess-wago');
    data = join(root, 'var/lib/attraccess-wago');
    tx = join(root, 'var/lib/attraccess-wago-install-transaction');
    for (const directory of [config, join(root, 'var/lib'), join(root, 'tmp'), join(root, 'bin'), join(root, 'bundle')])
      mkdirSync(directory, { recursive: true });
    write(join(config, 'runtime.env.next'), 'NEW=enrollment');
    write(join(root, 'docker.json'), '[]');
    write(join(root, 'bundle/image-reference'), `${image}\n`);
    write(join(root, 'bundle/image.tar'), 'fake image bytes');
    const archive = spawnSync('/usr/bin/tar', [
      '-cf',
      join(root, 'tmp/attraccess-wago-runtime.tar'),
      '-C',
      join(root, 'bundle'),
      'image-reference',
      'image.tar',
    ]);
    expect(archive.status).toBe(0);
    const executable = (name: string, content: string) =>
      writeFileSync(join(root, 'bin', name), content, { mode: 0o700 });
    // macOS tar lacks GNU warning switches; retain real archive extraction.
    executable(
      'tar',
      '#!/bin/sh\nif [ "$1" = --version ]; then echo "GNU tar fixture"; exit 0; fi\nshift 2\nexec /usr/bin/tar "$@"\n',
    );
    executable('ps', '#!/bin/sh\nif [ "$FAULT" = codesys ]; then echo codesys3; fi\n');
    executable(
      'df',
      '#!/bin/sh\nif [ "$FAULT" = storage ]; then echo "disk 100 99 1"; else echo "disk 999999 0 999999"; fi\n',
    );
    executable(
      'sha256sum',
      '#!/usr/bin/env python3\nimport hashlib,sys\ndigest,path=sys.stdin.read().strip().split(None,1)\nsys.exit(0 if hashlib.sha256(open(path,"rb").read()).hexdigest()==digest else 1)\n',
    );
    executable(
      'chown',
      '#!/bin/sh\nif [ "$FAULT" = data-kill ] && [ "$1" = 10001:10001 ]; then kill -KILL "$PPID"; fi\nexit 0\n',
    );
    executable(
      'rm',
      '#!/bin/sh\ncase "$*" in *install-transaction*) if [ "$FAULT" = cleanup-kill ]; then /bin/rm -f "$2/old-id"; kill -KILL "$PPID"; exit 1; fi;; esac\nexec /bin/rm "$@"\n',
    );
    // The parent shell retains FD 9, so this real advisory lock survives this
    // helper's exit, just like util-linux flock. Python is fixture-only.
    executable(
      'flock',
      '#!/usr/bin/env python3\nimport fcntl, sys\ntry: fcntl.flock(int(sys.argv[2]), fcntl.LOCK_EX | fcntl.LOCK_NB)\nexcept OSError: sys.exit(1)\n',
    );
    executable(
      'docker',
      `#!${process.execPath}
const fs = require('node:fs');
const path = require('node:path');
const root = process.env.FIXTURE_ROOT;
const args = process.argv.slice(2);
const fault = process.env.FAULT;
let state = JSON.parse(fs.readFileSync(path.join(root, 'docker.json'), 'utf8'));
const save = () => fs.writeFileSync(path.join(root, 'docker.json'), JSON.stringify(state));
const find = id => state.find(c => c.id === id || c.name === id);
fs.appendFileSync(path.join(root, 'docker.log'), args.join(' ') + '\\n');
if (args[0] === 'info') { console.log(path.join(root, 'var/lib')); process.exit(fault === 'docker-info' ? 1 : 0); }
else if (args[0] === 'container' && args[1] === 'ls') {
  if (fault === 'list') process.exit(1);
  state.forEach(c => console.log(c.id + ' ' + c.name));
} else if (args[0] === 'inspect') {
  const c = find(args.at(-1)); if (!c) process.exit(1);
  console.log(args[2] === '{{.Name}}' ? '/' + c.name : String(c.running));
} else if (args[0] === 'stop' || args[0] === 'start') {
  const c = find(args[1]); if (!c || (fault === 'rollback' && args[0] === 'start')) process.exit(1);
  c.running = args[0] === 'start'; save();
  if (fault === 'stop-kill' && args[0] === 'stop') process.kill(process.ppid, 'SIGKILL');
} else if (args[0] === 'rename') {
  const c = find(args[1]); if (!c || find(args[2])) process.exit(1);
  c.name = args[2]; save();
  if (fault === 'rename-kill') process.kill(process.ppid, 'SIGKILL');
} else if (args[0] === 'rm') {
  if (fault === 'remove') process.exit(1);
  const c = find(args.at(-1)); if (!c) process.exit(1);
  state = state.filter(x => x !== c); save();
} else if (args[0] === 'load') {
  console.log('Loaded image ID: sha256:fixture');
  if (fault === 'load') process.exit(1);
} else if (args[0] === 'image' && args[1] === 'inspect') {
  if (fault === 'inspect-image') process.exit(1);
} else if (args[0] === 'run') {
  if (find('attraccess-wago')) process.exit(1);
  if (!args.includes('--pull=never')) process.exit(1);
  const volume = args[args.indexOf('-v') + 1].split(':')[0];
  if (fs.existsSync(path.join(volume, 'credentials.json'))) process.exit(2);
  fs.writeFileSync(path.join(volume, 'new-state'), 'new enrollment state');
  const id = state.some(c => c.id === 'new-id') ? 'next-id' : 'new-id';
  state.push({ id, name: 'attraccess-wago', running: fault !== 'start' }); save();
  if (fault === 'kill') process.kill(process.ppid, 'SIGKILL');
  if (fault === 'term') process.kill(process.ppid, 'SIGTERM');
  if (fault === 'start' || fault === 'rollback') process.exit(1);
  console.log('new-id');
} else { console.error('Unexpected fake Docker invocation', args); process.exit(99); }
`,
    );
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  function delivery() {
    const bundle = readFileSync(join(root, 'tmp/attraccess-wago-runtime.tar'));
    return {
      bundle,
      script: runtimeBundleDeliveryScript(
        image,
        'NEW=enrollment',
        'public CA',
        bundle.length,
        createHash('sha256').update(bundle).digest('hex'),
        'a'.repeat(32),
        root,
      ),
    };
  }

  it('binds recovery to the delivery token and leaves a retryable restored receipt', () => {
    prior();
    rmSync(join(config, 'runtime.env.next'));
    const { script, bundle } = delivery();
    expect(run(script, '', bundle).status).toBe(0);

    expect(run(runtimeBundleRecoveryScript(root, 'b'.repeat(32))).stderr).toContain(
      'belongs to another commissioning session',
    );
    expect(run(runtimeBundleRecoveryScript(root, 'a'.repeat(32))).status).toBe(0);
    expect(existsSync(`${tx}.restored/token`)).toBe(true);
    const before = readFileSync(join(root, 'docker.log'), 'utf8');
    expect(run(runtimeBundleRecoveryScript(root, 'a'.repeat(32))).status).toBe(0);
    expect(readFileSync(join(root, 'docker.log'), 'utf8')).toBe(before);
  });

  it('completes interrupted cleanup when retrying a restored receipt', () => {
    prior();
    expect(install().status).toBe(0);
    expect(recover().status).toBe(0);
    mkdirSync(join(config, 'delivery'));
    write(join(config, 'delivery/phase'), 'installing');
    write(join(root, 'tmp/attraccess-wago-runtime.tar'), 'stale bundle');

    const before = readFileSync(join(root, 'docker.log'), 'utf8');
    expect(recover().status).toBe(0);
    expect(readFileSync(join(root, 'docker.log'), 'utf8')).toBe(before);
    expect(existsSync(`${tx}.restored/bundle`)).toBe(false);
    expect(existsSync(join(config, 'delivery'))).toBe(false);
    expect(existsSync(join(root, 'tmp/attraccess-wago-runtime.tar'))).toBe(false);
  });

  it('retains a delivery-only recovery receipt until the coordinator acknowledges it', () => {
    mkdirSync(join(config, 'delivery'));
    write(join(config, 'delivery/token'), 'a'.repeat(32));
    write(join(root, 'tmp/attraccess-wago-runtime.tar'), 'stale bundle');

    expect(run(runtimeBundleRecoveryScript(root, 'a'.repeat(32))).status).toBe(0);
    expect(existsSync(`${tx}.restored/token`)).toBe(true);
    expect(run(runtimeBundleRecoveryAcknowledgementScript(root, 'b'.repeat(32))).status).not.toBe(0);
    expect(existsSync(`${tx}.restored`)).toBe(true);
    expect(run(runtimeBundleRecoveryAcknowledgementScript(root, 'a'.repeat(32))).status).toBe(0);
    expect(existsSync(`${tx}.restored`)).toBe(false);
  });

  it('delivers one stream under flock and rolls the old CA back with prior data', () => {
    prior();
    write(join(data, 'mqtt-ca.pem'), 'old CA');
    rmSync(join(config, 'runtime.env.next'));
    const { script, bundle } = delivery();
    const result = run(
      runtimeBundleStreamReceiver,
      '',
      Buffer.concat([Buffer.from(Buffer.from(script).toString('base64') + '\n'), bundle]),
    );
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(readFileSync(join(config, 'runtime-ca.pem'), 'utf8')).toBe('public CA');
    expect(statSync(config).mode & 0o777).toBe(0o700);
    expect(statSync(join(config, 'runtime-ca.pem')).mode & 0o777).toBe(0o444);
    expect(readFileSync(join(root, 'docker.log'), 'utf8')).toContain(
      `-v ${data}:/var/lib/attraccess-wago -v ${config}/runtime-ca.pem:/var/lib/attraccess-wago/mqtt-ca.pem:ro`,
    );
    expect(existsSync(join(config, 'delivery'))).toBe(false);
    expect(existsSync(tx)).toBe(true);
    expect(recover().status).toBe(0);
    expect(readFileSync(join(data, 'mqtt-ca.pem'), 'utf8')).toBe('old CA');
    expect(readFileSync(join(config, 'runtime.env'), 'utf8')).toBe('OLD=secret');
  });

  it.each(['old-id', 'old-running', 'prepared', 'had-data', 'had-env', 'had-ca'])(
    'refuses destructive recovery with missing %s metadata',
    (file) => {
      prior();
      expect(install().status).toBe(0);
      rmSync(join(tx, file), { force: true });
      const before = readFileSync(join(root, 'docker.log'), 'utf8');
      expect(recover().status).not.toBe(0);
      expect(readFileSync(join(root, 'docker.log'), 'utf8')).toBe(before);
      expect(readFileSync(join(data, 'new-state'), 'utf8')).toBe('new enrollment state');
      expect(readFileSync(join(tx, 'data.previous/credentials.json'), 'utf8')).toBe('revoked-old-credentials');
    },
  );

  it('retries interrupted journal cleanup without touching the restored runtime', () => {
    prior();
    expect(install().status).toBe(0);
    expect(recover('cleanup-kill').status).not.toBe(0);
    expect(existsSync(tx)).toBe(false);
    expect(existsSync(`${tx}.restored/prepared`)).toBe(true);
    expect(existsSync(`${tx}.restored/old-id`)).toBe(true);
    const before = readFileSync(join(root, 'docker.log'), 'utf8');
    expect(recover().status).toBe(0);
    expect(readFileSync(join(root, 'docker.log'), 'utf8')).toBe(before);
    expect(containers()).toEqual([{ id: 'old-id', name: 'attraccess-wago', running: true }]);
    expect(readFileSync(join(data, 'credentials.json'), 'utf8')).toBe('revoked-old-credentials');
  });

  it('retries interrupted acceptance cleanup without touching the accepted runtime or CA', () => {
    prior();
    write(join(config, 'runtime-ca.pem.next'), 'accepted CA');
    expect(install().status).toBe(0);
    expect(run(runtimeBundleAcceptScript(root), 'cleanup-kill').status).not.toBe(0);
    expect(existsSync(tx)).toBe(false);
    const before = readFileSync(join(root, 'docker.log'), 'utf8');
    expect(recover().status).not.toBe(0);
    expect(readFileSync(join(root, 'docker.log'), 'utf8')).toBe(before);
    expect(run(runtimeBundleAcceptScript(root)).status).toBe(0);
    expect(readFileSync(join(root, 'docker.log'), 'utf8')).toBe(before);
    expect(readFileSync(join(config, 'runtime-ca.pem'), 'utf8')).toBe('accepted CA');
    expect(containers()).toEqual([{ id: 'new-id', name: 'attraccess-wago', running: true }]);
  });

  it('preserves the protected active CA through acceptance and restores it after a subsequent rollback', () => {
    write(join(config, 'runtime-ca.pem.next'), 'first CA');
    expect(install().status).toBe(0);
    expect(run(runtimeBundleAcceptScript(root)).status).toBe(0);
    expect(readFileSync(join(config, 'runtime-ca.pem'), 'utf8')).toBe('first CA');
    write(join(config, 'runtime.env.next'), 'NEXT=enrollment');
    write(join(config, 'runtime-ca.pem.next'), 'second CA');
    expect(install().status).toBe(0);
    expect(readFileSync(join(config, 'runtime-ca.pem'), 'utf8')).toBe('second CA');
    expect(recover().status).toBe(0);
    expect(readFileSync(join(config, 'runtime-ca.pem'), 'utf8')).toBe('first CA');
  });

  it.each([0, 7, 129, 130, 143])(
    'receives a private script without secrets in argv and cleans up on exit %s',
    (code) => {
      const secret = Buffer.from('fixture credential').toString('base64');
      writeFileSync(
        join(root, 'bin/sh'),
        `#!${process.execPath}
const fs = require('node:fs');
const {spawnSync} = require('node:child_process');
const args = process.argv.slice(2);
fs.writeFileSync(process.env.FIXTURE_ROOT + '/receiver-args', JSON.stringify(args));
if (args[0] !== '-c') {
  fs.writeFileSync(process.env.FIXTURE_ROOT + '/receiver-modes', JSON.stringify([
    fs.statSync(args[0]).mode & 511, fs.statSync(require('node:path').dirname(args[0])).mode & 511,
  ]));
}
const result = spawnSync('/bin/sh', args, {
  stdio: 'inherit', env: {...process.env, RECEIVER_PID: String(process.ppid)},
});
process.exit(result.status ?? 1);
`,
        { mode: 0o700 },
      );
      const signals: Partial<Record<number, string>> = { 129: 'HUP', 130: 'INT', 143: 'TERM' };
      const signal = signals[code];
      const script = `credential='${secret}'\ncat > "$FIXTURE_ROOT/received"\n${signal ? `kill -${signal} "$RECEIVER_PID"\nsleep 1` : `exit ${code}`}\n`;
      const bundle = Buffer.from([0, 255, 10, 23]);
      const result = run(
        runtimeBundleStreamReceiver,
        '',
        Buffer.concat([Buffer.from(Buffer.from(script).toString('base64') + '\n'), bundle]),
      );
      expect(result.status).toBe(code);
      const args = JSON.parse(readFileSync(join(root, 'receiver-args'), 'utf8'));
      expect(JSON.stringify(args)).not.toContain(secret);
      expect(args).toHaveLength(1);
      expect(JSON.parse(readFileSync(join(root, 'receiver-modes'), 'utf8'))).toEqual([0o600, 0o700]);
      expect(readFileSync(join(root, 'received'))).toEqual(bundle);
      expect(existsSync(join(args[0], '..'))).toBe(false);
    },
  );

  it('cleans up the private receiver directory when decoding fails', () => {
    const before = readdirSync(join(root, 'tmp'));
    expect(run(runtimeBundleStreamReceiver, '', Buffer.from('invalid base64!\n')).status).not.toBe(0);
    expect(readdirSync(join(root, 'tmp'))).toEqual(before);
  });

  it.each(['codesys', 'storage', 'docker-info'])('preflight %s failure leaves controller state untouched', (fault) => {
    prior();
    rmSync(join(config, 'runtime.env.next'));
    const { script, bundle } = delivery();
    expect(run(script, fault, bundle).status).not.toBe(0);
    expect(existsSync(join(config, 'delivery'))).toBe(false);
    expect(existsSync(tx)).toBe(false);
    expect(readFileSync(join(config, 'runtime.env'), 'utf8')).toBe('OLD=secret');
    expect(containers()[0].running).toBe(true);
  });

  it('rejects another process delivery and recovery while the first process is receiving bytes', async () => {
    prior();
    rmSync(join(config, 'runtime.env.next'));
    const { script, bundle } = delivery();
    const child = spawn('/bin/sh', ['-c', script], {
      env: { ...process.env, PATH: `${root}/bin:${process.env.PATH}`, FIXTURE_ROOT: root },
      stdio: ['pipe', 'ignore', 'pipe'],
    });
    child.stderr.resume();
    const closed = new Promise((resolve) => child.on('close', resolve));
    try {
      const deadline = Date.now() + 5000;
      while (!existsSync(join(config, 'delivery/phase')) && Date.now() < deadline)
        await new Promise((resolve) => setTimeout(resolve, 10));
      expect(existsSync(join(config, 'delivery/phase'))).toBe(true);
      expect(run(script, '', bundle).stderr).toContain('holds the controller lock');
      expect(recover().stderr).toContain('holds the controller lock');
      expect(readFileSync(join(config, 'delivery/token'), 'utf8').trim()).toBe('a'.repeat(32));
      expect(readFileSync(join(config, 'runtime.env'), 'utf8')).toBe('OLD=secret');
      child.stdin.end(bundle.subarray(0, 10));
      await closed;
      expect(run(script, '', bundle).stderr).toContain('explicit recovery required');
      expect(existsSync(join(config, 'delivery'))).toBe(true);
      expect(recover().status).toBe(0);
      expect(existsSync(join(config, 'delivery'))).toBe(false);
      expect(containers()[0].running).toBe(true);
      expect(readFileSync(join(config, 'runtime.env'), 'utf8')).toBe('OLD=secret');
    } finally {
      child.stdin.end();
      child.kill();
      await closed;
    }
  }, 15000);

  it('installs first enrollment with fresh data and retains an explicitly recoverable transaction', () => {
    const result = install();
    expect(result.stderr).toBe('');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('readiness unverified');
    expect(containers()).toEqual([{ id: 'new-id', name: 'attraccess-wago', running: true }]);
    expect(readFileSync(join(config, 'runtime.env'), 'utf8')).toBe('NEW=enrollment');
    expect(existsSync(join(tx, 'started'))).toBe(true);
    expect(recover().status).toBe(0);
    expect(containers()).toEqual([]);
    expect(existsSync(data)).toBe(false);
    expect(existsSync(join(config, 'runtime.env'))).toBe(false);
  });

  it.each([true, false])('preserves prior container, environment and data; recovery restores running=%s', (running) => {
    prior(running);
    expect(install().status).toBe(0);
    expect(containers()).toContainEqual({ id: 'old-id', name: 'attraccess-wago.previous', running: false });
    expect(readFileSync(join(tx, 'data.previous/credentials.json'), 'utf8')).toBe('revoked-old-credentials');
    expect(existsSync(join(data, 'credentials.json'))).toBe(false);
    expect(readFileSync(join(config, 'runtime.env.previous'), 'utf8')).toBe('OLD=secret');
    expect(recover().status).toBe(0);
    expect(containers()).toEqual([{ id: 'old-id', name: 'attraccess-wago', running }]);
    expect(readFileSync(join(data, 'credentials.json'), 'utf8')).toBe('revoked-old-credentials');
    expect(readFileSync(join(config, 'runtime.env'), 'utf8')).toBe('OLD=secret');
    expect(existsSync(join(data, 'new-state'))).toBe(false);
  });

  it.each(['load', 'inspect-image', 'start'])(
    'automatically rolls back %s failure without hiding its status',
    (fault) => {
      prior();
      expect(install(fault).status).not.toBe(0);
      expect(containers()).toEqual([{ id: 'old-id', name: 'attraccess-wago', running: true }]);
      expect(readFileSync(join(config, 'runtime.env'), 'utf8')).toBe('OLD=secret');
      expect(existsSync(join(data, 'credentials.json'))).toBe(true);
      expect(existsSync(tx)).toBe(false);
      expect(existsSync(join(config, 'runtime.env.next'))).toBe(false);
    },
  );

  it('rolls back a failed first install to absence', () => {
    expect(install('start').status).not.toBe(0);
    expect(containers()).toEqual([]);
    expect(existsSync(data)).toBe(false);
    expect(existsSync(join(config, 'runtime.env'))).toBe(false);
  });

  it.each(['kill', 'term'])('retains interrupted %s state and blocks retries until explicit recovery', (fault) => {
    prior();
    expect(install(fault).status).not.toBe(0);
    expect(existsSync(join(tx, 'data.previous/credentials.json'))).toBe(true);
    write(join(config, 'runtime.env.next'), 'ANOTHER=enrollment');
    const before = readFileSync(join(root, 'docker.log'), 'utf8');
    expect(install().stderr).toContain('transaction exists');
    expect(readFileSync(join(root, 'docker.log'), 'utf8')).toBe(before);
    expect(recover().status).toBe(0);
    expect(existsSync(join(config, 'runtime.env.next'))).toBe(false);
    expect(containers()[0].running).toBe(true);
  });

  it('keeps the journal if rollback fails and permits idempotent recovery', () => {
    prior();
    expect(install('rollback').stderr).toContain('Rollback incomplete');
    expect(existsSync(tx)).toBe(true);
    expect(readFileSync(join(data, 'credentials.json'), 'utf8')).toBe('revoked-old-credentials');
    expect(recover().status).toBe(0);
    expect(containers()[0].running).toBe(true);
    expect(readFileSync(join(data, 'credentials.json'), 'utf8')).toBe('revoked-old-credentials');
  });

  it.each(['stop-kill', 'rename-kill', 'data-kill'])(
    'recovers interruption at %s before container creation',
    (fault) => {
      prior();
      expect(install(fault).status).not.toBe(0);
      expect(existsSync(tx)).toBe(true);
      expect(recover().status).toBe(0);
      expect(containers()).toEqual([{ id: 'old-id', name: 'attraccess-wago', running: true }]);
      expect(readFileSync(join(data, 'credentials.json'), 'utf8')).toBe('revoked-old-credentials');
      expect(readFileSync(join(config, 'runtime.env'), 'utf8')).toBe('OLD=secret');
    },
  );

  it('does not discard the snapshot when removing the failed replacement fails', () => {
    prior();
    install('kill');
    expect(recover('remove').status).not.toBe(0);
    expect(existsSync(join(tx, 'data.previous/credentials.json'))).toBe(true);
    expect(run(runtimeBundleAcceptScript(root)).status).not.toBe(0);
    expect(recover().status).toBe(0);
  });

  it('serializes install and recovery against the controller filesystem lock', () => {
    prior();
    const lock = (script: string) =>
      spawnSync(
        'python3',
        [
          '-c',
          'import fcntl, subprocess, sys\nf = open(sys.argv[1], "w")\nfcntl.flock(f, fcntl.LOCK_EX)\nr = subprocess.run(["/bin/sh", "-c", sys.stdin.read()])\nsys.exit(r.returncode)',
          join(config, 'install.lock'),
        ],
        {
          input: script,
          encoding: 'utf8',
          timeout: 10000,
          env: { ...process.env, PATH: `${root}/bin:${process.env.PATH}`, FIXTURE_ROOT: root },
        },
      );
    expect(lock(runtimeBundleInstallScript(image, root)).stderr).toContain('holds the controller lock');
    expect(existsSync(tx)).toBe(false);
    expect(containers()[0].running).toBe(true);
    expect(install().status).toBe(0);
    expect(lock(runtimeBundleRecoveryScript(root)).stderr).toContain('holds the controller lock');
    expect(existsSync(join(tx, 'data.previous/credentials.json'))).toBe(true);
    expect(recover().status).toBe(0);
  });

  it('requires explicit acceptance to finish once snapshot disposal has started', () => {
    prior();
    expect(install().status).toBe(0);
    expect(run(runtimeBundleAcceptScript(root), 'remove').status).not.toBe(0);
    expect(recover().stderr).toContain('Acceptance already began');
    expect(run(runtimeBundleAcceptScript(root)).status).toBe(0);
    expect(containers()).toEqual([{ id: 'new-id', name: 'attraccess-wago', running: true }]);
  });

  it('cannot accept a partially recovered transaction', () => {
    prior();
    expect(install().status).toBe(0);
    expect(recover('rollback').status).not.toBe(0);
    expect(run(runtimeBundleAcceptScript(root)).stderr).toContain('Recovery already began');
    expect(recover().status).toBe(0);
    expect(containers()).toEqual([{ id: 'old-id', name: 'attraccess-wago', running: true }]);
  });

  it('isolates stale data even when no container exists', () => {
    mkdirSync(data);
    write(join(data, 'credentials.json'), 'stale revoked credentials');
    expect(install().status).toBe(0);
    expect(existsSync(join(data, 'credentials.json'))).toBe(false);
    expect(readFileSync(join(tx, 'data.previous/credentials.json'), 'utf8')).toBe('stale revoked credentials');
  });

  it('accepts explicitly and allows another enrollment without reusing its predecessor state', () => {
    prior();
    expect(install().status).toBe(0);
    expect(run(runtimeBundleAcceptScript(root)).status).toBe(0);
    expect(existsSync(tx)).toBe(false);
    expect(existsSync(join(config, 'runtime.env.previous'))).toBe(false);
    expect(containers()).toHaveLength(1);
    write(join(config, 'runtime.env.next'), 'NEXT=enrollment');
    expect(install().status).toBe(0);
  });

  it('rejects an incorrect bundle reference before changing the prior runtime', () => {
    prior();
    expect(run(runtimeBundleInstallScript(image.replace(/a{64}$/, 'b'.repeat(64)), root)).status).not.toBe(0);
    expect(containers()[0].running).toBe(true);
    expect(readFileSync(join(config, 'runtime.env'), 'utf8')).toBe('OLD=secret');
  });

  it('treats daemon query failure as failure, not a first install', () => {
    prior();
    expect(install('list').status).not.toBe(0);
    expect(existsSync(tx)).toBe(false);
    expect(containers()[0].running).toBe(true);
  });

  it('refuses unowned previous state', () => {
    write(join(config, 'runtime.env.previous'), 'unknown snapshot');
    expect(install().status).not.toBe(0);
    expect(readFileSync(join(config, 'runtime.env.previous'), 'utf8')).toBe('unknown snapshot');
  });
});
