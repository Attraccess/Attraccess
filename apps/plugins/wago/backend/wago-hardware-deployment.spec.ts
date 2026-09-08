import { chmodSync, existsSync, lstatSync, mkdirSync, renameSync, rmSync, statSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { fw31ShellFixture } from './fixtures/fw31-shell-fixture';
import {
  WAGO_DIN,
  WAGO_DOUT,
  parseWagoHardwareDeploymentReport,
  wagoCommissioningPreparationScript,
  wagoDockerProvisionScript,
  wagoDockerProvisionRecoveryScript,
  wagoDockerProvisionFinishScript,
  wagoHardwareDeploymentDockerArgs,
  wagoHardwareDeploymentReportScript,
  wagoRuntimeBootScript,
} from './wago-hardware-deployment';

describe('FW31 destructive commissioning shell (isolated vendor command fixtures)', () => {
  let fixture: ReturnType<typeof fw31ShellFixture>;
  const token = 'a'.repeat(32);
  const journal = 'etc/attraccess-wago/docker-provision';
  const prepare = (fault = '') => fixture.run(wagoCommissioningPreparationScript(token, fixture.root), fault);
  const report = () => fixture.run(wagoHardwareDeploymentReportScript(fixture.root));
  const recover = (fault = '') => fixture.run(wagoDockerProvisionRecoveryScript(token, fixture.root), fault);
  const finish = () => fixture.run(wagoDockerProvisionFinishScript(token, 'restored', fixture.root));
  const activePlc = () => {
    fixture.file('plc', 'running');
    fixture.file('etc/specific/rtsversion', '1');
    symlinkSync(join(fixture.root, 'etc/init.d/runtime'), join(fixture.root, 'etc/rc.d/S98_runtime'));
  };
  beforeEach(() => {
    fixture = fw31ShellFixture();
  });
  afterEach(() => fixture.dispose());

  it('reports software support read-only and strictly parses the enum-only contract', () => {
    const r = report();
    expect(r.status).toBe(0);
    expect(parseWagoHardwareDeploymentReport(r.stdout)).toMatchObject({
      platform: 'supported',
      hardware: 'accessible',
      docker: 'running',
      exclusivity: 'clear',
      provision: 'prepare-controller',
      qualification: 'software-supported',
    });
    expect(() => parseWagoHardwareDeploymentReport(r.stdout.trimEnd())).toThrow();
    expect(() => parseWagoHardwareDeploymentReport(r.stdout.replace('hardware=accessible', 'version=1'))).toThrow();
    expect(existsSync(join(fixture.root, 'vendor.log'))).toBe(false);
    expect(fixture.read(WAGO_DIN)).toBe('5');
    expect(fixture.read(WAGO_DOUT)).toBe('2');
  });

  it('pins vendor subprocess Docker commands to the local socket despite an inherited remote context', () => {
    const script =
      'export DOCKER_CONTEXT=untrusted DOCKER_HOST=tcp://untrusted:2375\n' +
      wagoCommissioningPreparationScript(token, fixture.root);
    expect(fixture.run(script).status).toBe(0);
  });

  it.each(['VERSION_ID="32"', 'VERSION_ID="31"\nVERSION="30"', 'VERSION_ID="2024.12.0"'])(
    'rejects ambiguous firmware before changing the controller: %s',
    (version) => {
      fixture.file('etc/os-release', 'PTXDIST_PLATFORM_NAME="cc100"\n' + version + '\n');
      expect(prepare().stderr).toContain('unsupported-firmware');
      expect(existsSync(join(fixture.root, journal))).toBe(false);
      expect(existsSync(join(fixture.root, 'vendor.log'))).toBe(false);
    },
  );

  it('always stops and permanently disables active CODESYS before granting exact UID permissions', () => {
    activePlc();
    chmodSync(join(fixture.root, WAGO_DIN), 0o444);
    chmodSync(join(fixture.root, WAGO_DOUT), 0o666);
    fixture.file('owners.json', '{}');
    expect(report().stdout).toContain('exclusivity=codesys-active');
    expect(prepare().status).toBe(0);
    expect(fixture.read('vendor.log')).toContain(
      'runtime stop 1\nruntime stop 2\nconfig_runtime --wait runtime-version=0 force-new-version=yes restart-server=NO',
    );
    expect(fixture.read('plc')).toBe('stopped');
    expect(fixture.read('etc/specific/rtsversion')).toBe('0');
    expect(existsSync(join(fixture.root, 'etc/rc.d/S98_runtime'))).toBe(false);
    expect(statSync(join(fixture.root, WAGO_DIN)).mode & 0o777).toBe(0o400);
    expect(statSync(join(fixture.root, WAGO_DOUT)).mode & 0o777).toBe(0o600);
    expect(fixture.read(WAGO_DOUT)).toBe('2');
    expect(existsSync(join(fixture.root, journal, 'started'))).toBe(true);
    expect(prepare().status).toBe(0);
  });

  it('stops a stale active PLC when the selected runtime is already zero', () => {
    fixture.file('plc', 'running');
    expect(prepare('codesys2').status).toBe(0);
    expect(fixture.read('plc')).toBe('stopped');
  });

  it.each(['absent', 'broken'])('rejects vendor success with nonzero selection and an %s enabled link', (kind) => {
    fixture.file('etc/specific/rtsversion', '1');
    if (kind === 'broken')
      symlinkSync(join(fixture.root, 'missing-runtime'), join(fixture.root, 'etc/rc.d/S98_runtime'));
    const owners = fixture.read('owners.json');
    expect(prepare().stderr).toContain('codesys-boot-enabled');
    expect(fixture.read('etc/specific/rtsversion')).toBe('1');
    expect(fixture.read('owners.json')).toBe(owners);
    expect(existsSync(join(fixture.root, journal, 'started'))).toBe(false);
  });

  it.each(['codesys-stop-failed', 'codesys-stop-stuck', 'codesys-disable-failed', 'codesys-boot-stuck'])(
    'fails closed without IO ownership or runtime start when %s',
    (fault) => {
      activePlc();
      fixture.file('owners.json', '{}');
      expect(prepare(fault).status).not.toBe(0);
      expect(fixture.read('owners.json')).toBe('{}');
      expect(existsSync(join(fixture.root, journal, 'started'))).toBe(false);
      expect(fixture.containers()).toEqual([]);
    },
  );

  it.each(['missing', 'directory', 'symlink'])('rejects a %s output register', (kind) => {
    rmSync(join(fixture.root, WAGO_DOUT));
    if (kind === 'directory') mkdirSync(join(fixture.root, WAGO_DOUT));
    if (kind === 'symlink') symlinkSync(join(fixture.root, WAGO_DIN), join(fixture.root, WAGO_DOUT));
    expect(prepare().status).not.toBe(0);
    expect(existsSync(join(fixture.root, journal, 'started'))).toBe(false);
  });

  it.each(['chown-failed', 'setpriv-unsupported', 'io-permissions'])('fails closed for %s', (fault) => {
    expect(prepare(fault).status).not.toBe(0);
    expect(existsSync(join(fixture.root, journal, 'started'))).toBe(false);
  });

  it('uses firmware install/activate and enables the vendor boot hook without downloading binaries', () => {
    fixture.file('daemon', 'stopped');
    renameSync(join(fixture.root, 'etc/rc.d/S99_docker'), join(fixture.root, 'etc/rc.d/disabled/S99_docker'));
    expect(report().stdout).toContain('provision=install-vendor-runtime');
    expect(prepare().status).toBe(0);
    expect(fixture.read('vendor.log')).toContain('config_docker install\nconfig_docker activate\ndockerd start\n');
    expect(existsSync(join(fixture.root, 'etc/rc.d/S99_docker'))).toBe(true);
    expect(fixture.read('daemon')).toBe('running');
  });

  it('activates installed stopped Docker despite existing storage and prior workload metadata', () => {
    fixture.file('daemon', 'stopped');
    fixture.file('home/docker/containers/old/config.v2.json', '{}');
    expect(report().stdout).toContain('docker=installed-stopped');
    expect(prepare().status).toBe(0);
    expect(fixture.read('vendor.log')).not.toContain('config_docker install');
    expect(fixture.read('vendor.log')).toContain('config_docker activate');
  });

  it('retains a retryable owned journal until Docker permits verified containment', () => {
    fixture.file('daemon', 'stopped');
    expect(prepare('docker-activate-failed').stderr).toContain('docker-activation-failed');
    expect(recover().status).not.toBe(0);
    expect(existsSync(join(fixture.root, journal, 'restored'))).toBe(false);
    fixture.file('daemon', 'running');
    expect(recover().status).toBe(0);
    expect(finish().status).toBe(0);
    expect(recover().status).toBe(0);
    expect(finish().status).toBe(0);
    expect(fixture.read('daemon')).toBe('running');
  });

  it('does not fabricate install support when a firmware binary is missing', () => {
    rmSync(join(fixture.root, 'bin/dockerd'));
    expect(prepare().status).not.toBe(0);
    expect(existsSync(join(fixture.root, 'vendor.log'))).toBe(false);
  });

  it.each([WAGO_DOUT, '/sys', '/'])('rejects other output writers with bind %s', (source) => {
    fixture.setContainers([
      { id: 'other', name: 'other', running: false, mounts: [source === '/' ? '/' : join(fixture.root, source)] },
    ]);
    expect(prepare().stderr).toContain('output-container-conflict');
  });

  it('rejects privileged competitors even when Docker lists no explicit output bind', () => {
    fixture.setContainers([{ id: 'other', name: 'other', running: false, privileged: true }]);
    expect(prepare().stderr).toContain('output-container-conflict');
  });

  it('stops the exact owned predecessor and disables its unsafe restart before takeover', () => {
    fixture.setContainers([
      {
        id: 'old',
        name: 'attraccess-wago',
        running: true,
        restart: 'unless-stopped',
        mounts: [join(fixture.root, WAGO_DOUT)],
      },
    ]);
    expect(prepare().status).toBe(0);
    expect(fixture.containers()[0]).toMatchObject({ running: false, restart: 'no' });
  });

  it.each(['ps-failed', 'docker-info-failed', 'docker-list-failed', 'locked'])(
    'refuses uncertain state: %s',
    (fault) => {
      expect(prepare(fault).status).not.toBe(0);
    },
  );

  it('rejects an unrelated journal token and exposes explicit action validation', () => {
    expect(() =>
      wagoDockerProvisionScript({ token, action: 'start-installed-runtime', reviewedDockerActivation: false }),
    ).toThrow();
    expect(() => wagoCommissioningPreparationScript('invalid')).toThrow();
    fixture.file(journal + '/token', 'b'.repeat(32));
    fixture.file(journal + '/mode', 'destructive');
    expect(prepare().stderr).toContain('token mismatch');
    expect(recover().stderr).toContain('token mismatch');
  });

  it('recovers a preflight-only failure without requiring an old workload snapshot', () => {
    expect(recover().status).toBe(0);
    expect(finish().status).toBe(0);
    expect(recover().status).toBe(0);
    expect(fixture.containers()).toEqual([]);
  });

  it('contains legacy activation effects without restoring CODESYS or vendor networking', () => {
    fixture.file(journal + '/token', token);
    fixture.file(journal + '/prior', 'stopped');
    fixture.file(journal + '/started', '');
    fixture.file(journal + '/start-intent', '');
    expect(recover().status).toBe(0);
    expect(finish().status).toBe(0);
    expect(fixture.read('daemon')).toBe('running');
    expect(existsSync(join(fixture.root, 'vendor.log'))).toBe(false);
  });

  it('retains incomplete legacy integrity metadata rather than deleting it', () => {
    fixture.file(journal + '/token', token);
    fixture.file(journal + '/prior', 'stopped');
    fixture.file(journal + '/os-release', fixture.read('etc/os-release'));
    expect(recover().stderr).toContain('Incomplete firmware/service context');
  });

  it('retains recovery ownership when dockerd is absent but an owned writer may survive', () => {
    fixture.file(journal + '/token', token);
    fixture.file(journal + '/mode', 'destructive');
    fixture.file('daemon', 'stopped');
    fixture.setContainers([{ id: 'survivor', name: 'attraccess-wago', running: true }]);
    expect(recover().status).not.toBe(0);
    expect(existsSync(join(fixture.root, journal, 'restored'))).toBe(false);
    expect(fixture.containers()[0].running).toBe(true);
  });

  it('does not follow a planted fixed boot staging symlink', () => {
    fixture.file('unrelated-root-file', 'unchanged');
    symlinkSync(join(fixture.root, 'unrelated-root-file'), join(fixture.root, 'etc/attraccess-wago/runtime-boot.next'));
    expect(prepare().status).toBe(0);
    expect(fixture.read('unrelated-root-file')).toBe('unchanged');
    expect(lstatSync(join(fixture.root, 'etc/rc.d/S99_zz_attraccess_wago')).isSymbolicLink()).toBe(false);
  });

  it.each([journal, `etc/attraccess-wago/docker-provision.completed-${token}`])(
    'rejects a non-root-owned retained preparation journal: %s',
    (path) => {
      fixture.file(path + '/token', token);
      fixture.file(path + '/mode', 'destructive');
      fixture.file('owners.json', JSON.stringify({ ['/' + path]: '20000:20000' }));
      expect(prepare().stderr).toContain('Unsafe preparation journal ownership');
      expect(recover().stderr).toContain('Unsafe preparation journal ownership');
      expect(existsSync(join(fixture.root, path, 'started'))).toBe(false);
    },
  );

  it('contains a boot start when its supervisor cannot acknowledge startup', () => {
    fixture.file('etc/attraccess-wago/runtime-enabled', '');
    fixture.setContainers([{ id: 'new', name: 'attraccess-wago', running: false, restart: 'no' }]);
    const result = fixture.run('set -- start\n' + wagoRuntimeBootScript(fixture.root), 'supervisor-launch-failed');
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Runtime supervisor launch unverified');
    expect(fixture.containers()[0]).toMatchObject({ running: false, restart: 'no' });
  });

  it('contains a supervisor failure to execute its gate', () => {
    fixture.file('etc/attraccess-wago/runtime-enabled', '');
    fixture.setContainers([{ id: 'new', name: 'attraccess-wago', running: true, restart: 'no' }]);
    fixture.file('etc/rc.d/S99_zz_attraccess_wago', '#!/absent/fixture-interpreter\n', 0o700);
    expect(fixture.run('set -- supervise\n' + wagoRuntimeBootScript(fixture.root)).status).not.toBe(0);
    expect(fixture.containers()[0].running).toBe(false);
  });

  it.each(['start', 'supervise'])('contains an overall %s observation timeout', (action) => {
    fixture.file('etc/attraccess-wago/runtime-enabled', '');
    fixture.setContainers([{ id: 'new', name: 'attraccess-wago', running: true, restart: 'no' }]);
    const result = fixture.run(`set -- ${action}\n` + wagoRuntimeBootScript(fixture.root), 'gate-timeout');
    expect(result.status).not.toBe(0);
    expect(fixture.containers()[0].running).toBe(false);
    expect(existsSync(join(fixture.root, 'etc/attraccess-wago/runtime-enabled'))).toBe(false);
  });

  it.each(['ps-failed', 'docker-list-failed', 'docker-inspect-failed', 'readlink-failed'])(
    'contains an already running runtime when boot observation fails: %s',
    (fault) => {
      fixture.file('etc/attraccess-wago/runtime-enabled', '');
      fixture.setContainers([{ id: 'new', name: 'attraccess-wago', running: true, restart: 'no' }]);
      expect(fixture.run('set -- start\n' + wagoRuntimeBootScript(fixture.root), fault).status).not.toBe(0);
      expect(fixture.read('docker.log')).toContain('stop attraccess-wago');
      expect(fixture.containers()[0].running).toBe(false);
    },
  );

  it('reports boot stop failure without declaring a surviving runtime stopped', () => {
    fixture.setContainers([{ id: 'new', name: 'attraccess-wago', running: true, restart: 'no' }]);
    expect(fixture.run('set -- stop\n' + wagoRuntimeBootScript(fixture.root), 'stop-failed').status).not.toBe(0);
    expect(fixture.containers()[0].running).toBe(true);
  });

  it('refuses a successful stop command whose postcondition still reports a running predecessor', () => {
    fixture.setContainers([{ id: 'old', name: 'attraccess-wago', running: true, restart: 'unless-stopped' }]);
    expect(prepare('stop-stuck').stderr).toContain('Cannot verify previous runtime containment');
    expect(existsSync(join(fixture.root, journal, 'started'))).toBe(false);
  });

  it('contains the predecessor before a failed CODESYS stop can interrupt preparation', () => {
    activePlc();
    fixture.setContainers([{ id: 'old', name: 'attraccess-wago', running: true, restart: 'unless-stopped' }]);
    expect(prepare('codesys-stop-failed').status).not.toBe(0);
    expect(fixture.containers()[0]).toMatchObject({ running: false, restart: 'no' });
    expect(existsSync(join(fixture.root, journal, 'started'))).toBe(false);
  });

  it('blocks an unowned open writable DOUT descriptor before changing IO permissions', () => {
    fixture.file('proc/99/status', 'Uid: 20000 20000 20000 20000\nGid: 20000 20000 20000 20000\nGroups: 20000\n');
    fixture.file('proc/99/stat', '99 (writer) S ' + '0 '.repeat(18) + '999\n');
    fixture.file('proc/99/fdinfo/7', 'flags: 0100001\n');
    mkdirSync(join(fixture.root, 'proc/99/fd'));
    symlinkSync(join(fixture.root, WAGO_DOUT), join(fixture.root, 'proc/99/fd/7'));
    const owners = fixture.read('owners.json');
    expect(prepare().status).not.toBe(0);
    expect(fixture.read('owners.json')).toBe(owners);
    expect(existsSync(join(fixture.root, journal, 'started'))).toBe(false);
  });

  it('rejects an alternate runtime boot link after the canonical entry is disabled', () => {
    symlinkSync(join(fixture.root, 'etc/init.d/runtime'), join(fixture.root, 'etc/rc.d/S97_plc'));
    expect(prepare().stderr).toContain('codesys-boot-enabled');
  });

  it('rejects a Docker boot entry pointing to an unrelated executable', () => {
    rmSync(join(fixture.root, 'etc/rc.d/S99_docker'));
    symlinkSync(join(fixture.root, 'etc/init.d/runtime'), join(fixture.root, 'etc/rc.d/S99_docker'));
    expect(prepare().status).not.toBe(0);
  });

  it('rejects vendor activation from SD boot before calling the mutation', () => {
    fixture.file('daemon', 'stopped');
    expect(prepare('sd-card').stderr).toContain('Unsupported Docker boot medium');
    expect(fixture.read('vendor.log')).not.toContain('config_docker');
  });

  it('rechecks active CODESYS before a supervised crash retry', () => {
    fixture.file('etc/attraccess-wago/runtime-enabled', '');
    fixture.setContainers([{ id: 'new', name: 'attraccess-wago', running: true, restart: 'no' }]);
    fixture.file(
      'bin/sleep',
      `#!${process.execPath}
const fs=require('node:fs'),root=process.env.FIXTURE_ROOT;
const state=JSON.parse(fs.readFileSync(root+'/containers.json','utf8'));
state[0].running=false;fs.writeFileSync(root+'/containers.json',JSON.stringify(state));
fs.rmSync(root+'/proc/42',{recursive:true,force:true});fs.writeFileSync(root+'/plc','running');
`,
      0o700,
    );
    const result = fixture.run('set -- supervise\n' + wagoRuntimeBootScript(fixture.root));
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('codesys-active');
    expect(fixture.read('docker.log')).not.toContain('start attraccess-wago');
    expect(fixture.containers()[0].running).toBe(false);
  });

  it('caps host-supervised crash starts at five without delegating a retry to Docker', () => {
    fixture.file('etc/attraccess-wago/runtime-enabled', '');
    fixture.setContainers([{ id: 'new', name: 'attraccess-wago', running: false, restart: 'no' }]);
    fixture.file(
      'bin/sleep',
      `#!${process.execPath}
const fs=require('node:fs'),root=process.env.FIXTURE_ROOT;
const state=JSON.parse(fs.readFileSync(root+'/containers.json','utf8'));
state[0].running=false;fs.writeFileSync(root+'/containers.json',JSON.stringify(state));
fs.rmSync(root+'/proc/42',{recursive:true,force:true});
`,
      0o700,
    );
    const result = fixture.run('set -- supervise\n' + wagoRuntimeBootScript(fixture.root), '', undefined, 60000);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('Runtime crash retry limit reached');
    expect(
      fixture
        .read('docker.log')
        .split('\n')
        .filter((line) => line === 'start attraccess-wago'),
    ).toHaveLength(5);
    expect(fixture.containers()[0]).toMatchObject({ running: false, restart: 'no' });
    expect(existsSync(join(fixture.root, 'etc/attraccess-wago/runtime-enabled'))).toBe(false);
  }, 65000);

  it('reapplies narrow permissions on reboot and starts only after the gate succeeds', () => {
    expect(prepare().status).toBe(0);
    fixture.file('etc/attraccess-wago/runtime-enabled', '');
    fixture.setContainers([{ id: 'new', name: 'attraccess-wago', running: false, restart: 'no' }]);
    fixture.file('owners.json', '{}');
    const r = fixture.run(wagoRuntimeBootScript(fixture.root) + '\n', '');
    // Invoke it as init would: the action must be start.
    expect(r.status).not.toBe(0);
    const boot = fixture.run('set -- start\n' + wagoRuntimeBootScript(fixture.root));
    expect(boot.status).toBe(0);
    expect(fixture.containers()[0].running).toBe(true);
  });

  it('does not stop another active transaction when the boot hook cannot obtain its lock', () => {
    fixture.file('etc/attraccess-wago/runtime-enabled', '');
    fixture.setContainers([{ id: 'new', name: 'attraccess-wago', running: true, restart: 'no' }]);
    expect(fixture.run('set -- start\n' + wagoRuntimeBootScript(fixture.root), 'locked').status).not.toBe(0);
    expect(fixture.containers()[0].running).toBe(true);
  });

  it.each(['start', 'stop'])('preserves a competing transaction during the %s lock handoff', (action) => {
    fixture.file('etc/attraccess-wago/runtime-enabled', '');
    fixture.setContainers([{ id: 'new', name: 'attraccess-wago', running: true, restart: 'no' }]);
    const result = fixture.run(`set -- ${action}\n` + wagoRuntimeBootScript(fixture.root), 'lock-handoff');
    expect(result.status).toBe(75);
    expect(fixture.containers()[0].running).toBe(true);
    expect(existsSync(join(fixture.root, 'etc/attraccess-wago/runtime-enabled'))).toBe(true);
  });

  it.each(['active-plc', 'wrong-policy', 'permission-failure', 'missing-register'])(
    'blocks runtime boot for %s even if run-parts proceeds',
    (failure) => {
      expect(prepare().status).toBe(0);
      fixture.file('etc/attraccess-wago/runtime-enabled', '');
      fixture.setContainers([
        {
          id: 'new',
          name: 'attraccess-wago',
          running: false,
          restart: failure === 'wrong-policy' ? 'unless-stopped' : 'no',
        },
      ]);
      if (failure === 'active-plc') fixture.file('plc', 'running');
      if (failure === 'missing-register') rmSync(join(fixture.root, WAGO_DOUT));
      expect(
        fixture.run(
          'set -- start\n' + wagoRuntimeBootScript(fixture.root),
          failure === 'permission-failure' ? 'chown-failed' : '',
        ).status,
      ).not.toBe(0);
      expect(fixture.containers()[0].running).toBe(false);
    },
  );

  it('emits UID, capabilities, host networking and only two contracted register mounts', () => {
    const args = wagoHardwareDeploymentDockerArgs();
    expect(args).toContain('--user 10001:10001 --cap-drop ALL --security-opt no-new-privileges --network host');
    expect(args).toContain('dst=/run/attraccess-wago/io/din,readonly');
    expect(args).toContain('dst=/run/attraccess-wago/io/dout');
    expect(args).not.toMatch(/--privileged|--device|docker.sock|--user 0/);
  });
});
