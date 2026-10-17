import { spawnSync } from 'node:child_process';
import { createHash, scryptSync } from 'node:crypto';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { fw31ShellFixture } from '../../../fixtures/fw31-shell-fixture';
import { WagoManagedUpdates1780010650000 } from '../../../migrations/1780010650000-add-wago-managed-updates';
import { BuildRuntimeArtifact } from '../../artifacts/build';
import { commissioningAcceptanceScript } from '../../../commissioning/delivery/accept';
import { WAGO_DIN, WAGO_DOUT } from '../../../host/hardware-deployment';
import { WagoDeviceOperation, WagoManagedAccess, WagoRuntimeUpdateEntity } from '../access.entity';
import { managedHostHelper } from './helper';
import { MANAGED_HELPER_PROTOCOL } from './installer';
import {
  managedAccessWatchdog,
  managedCommitScript,
  managedCutoverScript,
  managedProvisionScript,
  managedWatchdogScript,
} from './provision';
import { managedSshFailure } from '../transport/ssh';
import { generateManagementKey } from '../../../management/key';
import { runtimeBundleDeliveryScript } from '../../install';

const artifact: BuildRuntimeArtifact = {
  imageId: `sha256:${'1'.repeat(64)}`,
  image: `ghcr.io/attraccess/wago-cc100-runtime@sha256:${'2'.repeat(64)}`,
  buildId: '3'.repeat(40),
  digest: '4'.repeat(64),
  bytes: 81920,
  manifest: {
    schemaVersion: 1,
    runtime: 'attraccess-wago-cc100',
    runtimeVersion: '0.1.0',
    protocolVersion: '1.0.0',
    image: `ghcr.io/attraccess/wago-cc100-runtime@sha256:${'2'.repeat(64)}`,
    hardware: {
      model: '751-9301',
      platform: 'linux/arm/v7',
      firmwareBaseline: '31',
      profile: 'cc100-751-9301-fw31-digital-v1',
    },
  },
};
jest.mock('@attraccess/plugins-backend-sdk', () => jest.requireActual('typeorm'));

jest.mock('../../../controllers/service', () => ({ WagoService: class {} }));

jest.mock('../../artifacts/catalog', () => ({ WagoRuntimeArtifactsService: class {} }));

jest.mock('../../../commissioning/readiness/readiness', () => ({ WagoCommissioningReadiness: class {} }));

jest.mock('../transport/ssh', () => ({ ...jest.requireActual('../transport/ssh'), managedSsh: jest.fn() }));

jest.mock('../../../commissioning/sessions/verification', () => ({ commissioningVerification: jest.fn() }));

describe('fixed managed executor and recovery programs', () => {
  it('reports the legacy receiver capability without taking the mutation lock', () => {
    const fixture = fw31ShellFixture();
    try {
      fixture.file('bin/id', '#!/bin/sh\necho 0\n', 0o700);
      fixture.file('etc/attraccess-wago/install.lock', '');
      fixture.file('etc/attraccess-wago-management/token', 'a'.repeat(32));
      const request = Buffer.from(`receiver-status ${'a'.repeat(32)}\n`);
      const helper = managedHostHelper(artifact, fixture.root);
      expect(fixture.run(helper, 'supervisor-lock-held', request).stdout).toBe('head-byte-count supported\n');
      rmSync(join(fixture.root, 'bin/head'));
      fixture.file('bin/head', '#!/bin/sh\nexit 1\n', 0o700);
      const unsupported = fixture.run(helper, 'supervisor-lock-held', request);
      expect({ status: unsupported.status, stdout: unsupported.stdout, stderr: unsupported.stderr }).toEqual({
        status: 0,
        stdout: 'head-byte-count unsupported\n',
        stderr: '',
      });
      expect(fixture.run(helper, '', Buffer.from(`receiver-status ${'b'.repeat(32)}\n`)).status).not.toBe(0);
    } finally {
      fixture.dispose();
    }
  });

  it.each(['native', 'terse'] as const)(
    'reports update storage requirements without writing controller state (%s stat)',
    (statStyle) => {
      const fixture = fw31ShellFixture(statStyle);
      try {
        fixture.file('bin/id', '#!/bin/sh\necho 0\n', 0o700);
        fixture.file('etc/attraccess-wago/install.lock', '');
        fixture.file('etc/attraccess-wago-management/token', 'a'.repeat(32));
        const containers = fixture.read('containers.json');
        const result = fixture.run(
          managedHostHelper(artifact, fixture.root),
          'supervisor-lock-held',
          Buffer.from(`storage-status ${'a'.repeat(32)}\n`),
        );
        expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
        expect(result.stdout).toBe(
          ['/var/lib', '/var/lib'].map((path) => `${fixture.root}${path} 999999 16704 disk /fixture\n`).join(''),
        );
        expect(fixture.read('containers.json')).toBe(containers);
        expect(existsSync(join(fixture.root, 'var/lib/attraccess-wago-update-transaction'))).toBe(false);
        expect(
          fixture.run(managedHostHelper(artifact, fixture.root), '', Buffer.from(`storage-status ${'b'.repeat(32)}\n`))
            .status,
        ).not.toBe(0);
        rmSync(join(fixture.root, 'etc/attraccess-wago'), { recursive: true });
        expect(
          fixture.run(managedHostHelper(artifact, fixture.root), '', Buffer.from(`storage-status ${'a'.repeat(32)}\n`))
            .status,
        ).not.toBe(0);
        expect(existsSync(join(fixture.root, 'etc/attraccess-wago'))).toBe(false);
      } finally {
        fixture.dispose();
      }
    },
  );

  it.each(['native', 'terse'] as const)(
    'inspects the running image without interrupting a busy hardware supervisor (%s stat)',
    (statStyle) => {
      const fixture = fw31ShellFixture(statStyle);
      try {
        fixture.file('bin/id', '#!/bin/sh\necho 0\n', 0o700);
        fixture.file('bin/cut', '#!/bin/sh\nexec /usr/bin/cut "$@"\n', 0o700);
        fixture.file('etc/attraccess-wago/install.lock', '');
        const helper = managedHostHelper(artifact, fixture.root);
        fixture.file('usr/sbin/attraccess-wago-management', helper, 0o700);
        const containers = JSON.stringify([
          { id: 'a'.repeat(64), name: 'attraccess-wago', imageId: artifact.imageId, running: true },
        ]);
        fixture.file('containers.json', containers);
        const result = fixture.run(helper, 'supervisor-lock-held', Buffer.from(`inspect ${'a'.repeat(32)}\n`));
        expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
        expect(result.stdout).toMatch(
          new RegExp(`^${MANAGED_HELPER_PROTOCOL}\\n[a-f0-9]{64}\\n${artifact.imageId} true\\n$`),
        );
        expect(fixture.read('containers.json')).toBe(containers);
        expect(fixture.read('usr/sbin/attraccess-wago-management')).toBe(helper);
      } finally {
        fixture.dispose();
      }
    },
  );

  it('uses the same RTU contract in stage, activation, acceptance and recovery, and preserves fixed diagnostic categories', () => {
    const helper = managedHostHelper({
      ...artifact,
      manifest: {
        ...artifact.manifest,
        hardware: { ...artifact.manifest.hardware, profile: 'cc100-751-9301-fw31-digital-rtu-v1' },
      },
    });
    const comparisons = [...helper.matchAll(/cat "\$tx\/profile"\)" = '([^']+)'/g)].map((entry) => entry[1]);
    expect(comparisons).toHaveLength(5);
    expect(new Set(comparisons)).toEqual(new Set(['cc100-751-9301-fw31-digital-rtu-v1']));
    expect(managedSshFailure('Insufficient update journal storage', 'transfer')).toBe('storage');
    expect(managedSshFailure('Runtime load failed', 'transfer')).toBe('load');
    expect(managedSshFailure('codesys-boot-enabled', 'transfer')).toBe('codesys_boot_enabled');
    expect(managedSshFailure('codesys-active', 'transfer')).toBe('codesys_active');
    expect(managedSshFailure('missing-register', 'transfer')).toBe('io_unavailable');
    expect(managedSshFailure('output-host-process-conflict', 'transfer')).toBe('writer_conflict');
    expect(managedSshFailure('Permission denied (publickey).', 'offline')).toBe('authentication');
    expect(managedSshFailure("flock: invalid option -- 'w'\nBusyBox v1.37.0 () multi-call binary.", 'offline')).toBe(
      'lock_tools',
    );
    expect(managedSshFailure('unexpected remote fixture-secret text', 'transfer')).toBe('transfer');
  });

  it.each(['native', 'terse'] as const)(
    'provisions on actual FW31 tools without chpasswd, getent or visudo and restores interrupted cutover/reboot (%s stat)',
    (statStyle) => {
      const fixture = fw31ShellFixture(statStyle);
      try {
        const node = (name: string, source: string) =>
          fixture.file(`bin/${name}`, `#!${process.execPath}\n${source}`, 0o700);
        fixture.file('accounts.json', JSON.stringify({ root: { uid: 0, gid: 0, home: '/root' } }));
        fixture.file('groups.json', JSON.stringify({ root: 0 }));
        node(
          'id',
          `const fs=require('fs'),r=process.env.FIXTURE_ROOT,a=JSON.parse(fs.readFileSync(r+'/accounts.json')),args=process.argv.slice(2),u=a[args[0]?.startsWith('-')?(args[1]||'root'):(args[0]||'root')];if(!u)process.exit(1);if(args[0]==='-u')console.log(u.uid);else if(args[0]==='-g')console.log(u.gid);`,
        );
        node(
          'groupadd',
          `const fs=require('fs'),r=process.env.FIXTURE_ROOT,g=JSON.parse(fs.readFileSync(r+'/groups.json'));g.attraccess=1111;fs.writeFileSync(r+'/groups.json',JSON.stringify(g));fs.writeFileSync(r+'/etc/group',Object.entries(g).map(([n,id])=>n+':x:'+id+':').join('\\n')+'\\n');`,
        );
        node(
          'useradd',
          `const fs=require('fs'),r=process.env.FIXTURE_ROOT,a=JSON.parse(fs.readFileSync(r+'/accounts.json'));a.attraccess={uid:1111,gid:1111,home:r+'/home/attraccess'};fs.writeFileSync(r+'/accounts.json',JSON.stringify(a));fs.mkdirSync(r+'/home/attraccess',{recursive:true,mode:0o700});fs.writeFileSync(r+'/etc/passwd',Object.entries(a).map(([n,u])=>n+':x:'+u.uid+':'+u.gid+'::'+u.home+':/bin/sh').join('\\n')+'\\n');`,
        );
        node(
          'passwd',
          `const fs=require('fs'),crypto=require('crypto'),r=process.env.FIXTURE_ROOT,text=fs.readFileSync(0,'utf8').trim().split('\\n');if(text.length!==2||text[0]!==text[1])process.exit(1);const file=r+'/password-hashes.json',hashes=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):{};hashes[process.argv.at(-1)]=crypto.scryptSync(text[0],'isolated-fixture',32).toString('hex');fs.writeFileSync(file,JSON.stringify(hashes));`,
        );
        fixture.file('bin/cut', '#!/bin/sh\nexec /usr/bin/cut "$@"\n', 0o700);
        fixture.file('bin/sudo', '#!/bin/sh\nexit 0\n', 0o700);
        fixture.file('etc/sudoers', '#includedir ' + fixture.root + '/etc/sudoers.d\n');
        fixture.file('usr/sbin/dropbear', '#!/bin/sh\necho "Dropbear v2025.88"\n', 0o700);
        fixture.file('etc/sudoers.d/fixture', '');
        fixture.file('etc/init.d/dropbear', '#!/bin/sh\nprintf old-policy >> "$FIXTURE_ROOT/ssh-restarts"\n', 0o755);
        const token = 'a'.repeat(32),
          key = generateManagementKey(),
          password = 'b'.repeat(43);
        const success = (result: ReturnType<typeof fixture.run>) =>
          expect({
            status: result.status,
            stderr: result.stderr,
            failure: result.stdout.match(/WAGO_MANAGEMENT_FAILURE=([a-z]+)/)?.[1],
          }).toEqual({ status: 0, stderr: '', failure: undefined });
        fixture.file(
          'accounts.json',
          JSON.stringify({
            root: { uid: 0, gid: 0, home: '/root' },
            attraccess: { uid: 1111, gid: 1111, home: fixture.root + '/home/attraccess' },
          }),
        );
        expect(
          fixture.run(
            managedProvisionScript(
              token,
              key.publicKey,
              password,
              managedHostHelper(artifact, fixture.root),
              fixture.root,
            ),
          ).status,
        ).not.toBe(0);
        expect(existsSync(join(fixture.root, 'password-hashes.json'))).toBe(false);
        fixture.file('accounts.json', JSON.stringify({ root: { uid: 0, gid: 0, home: '/root' } }));
        success(
          fixture.run(
            managedProvisionScript(
              token,
              key.publicKey,
              password,
              managedHostHelper(artifact, fixture.root),
              fixture.root,
            ),
          ),
        );
        expect(fixture.read('home/attraccess/.ssh/authorized_keys')).toContain(
          `command="${fixture.root}/usr/bin/sudo -n ${fixture.root}/usr/sbin/attraccess-wago-management"`,
        );
        expect(fixture.read('etc/sudoers.d/attraccess-wago')).toContain('NOPASSWD:');
        const hashes = JSON.parse(fixture.read('password-hashes.json'));
        expect(hashes.root).toBe(scryptSync(password, 'isolated-fixture', 32).toString('hex'));
        expect(hashes.attraccess).not.toBe(hashes.root);
        // Re-enrolment stages an additional key; cleanup only follows a fresh
        // key-only proof persisted by the server. Both old and new work meanwhile.
        const replacement = generateManagementKey();
        success(
          fixture.run(
            managedProvisionScript(
              token,
              replacement.publicKey,
              password,
              managedHostHelper(artifact, fixture.root),
              fixture.root,
            ),
          ),
        );
        expect(fixture.read('home/attraccess/.ssh/authorized_keys')).toContain(key.publicKey);
        expect(fixture.read('home/attraccess/.ssh/authorized_keys')).toContain(replacement.publicKey);
        success(
          fixture.run(managedHostHelper(artifact, fixture.root), '', Buffer.from(`access-key-commit ${token}\n`)),
        );
        expect(fixture.read('home/attraccess/.ssh/authorized_keys')).not.toContain(key.publicKey);
        expect(fixture.read('home/attraccess/.ssh/authorized_keys')).toContain(replacement.publicKey);
        success(
          fixture.run(managedHostHelper(artifact, fixture.root), '', Buffer.from(`access-key-commit ${token}\n`)),
        );
        success(fixture.run(managedCutoverScript(token, fixture.root)));
        expect(fixture.read('etc/init.d/dropbear')).toContain('-G attraccess -w -s');
        success(fixture.run(`set -- boot\n${managedWatchdogScript(fixture.root)}`));
        // Boot arms a fresh bounded watchdog, allowing managed reboot verification.
        expect(fixture.read('etc/init.d/dropbear')).toContain('-G attraccess');
        success(fixture.run(`set --\n${managedWatchdogScript(fixture.root)}`));
        expect(fixture.read('etc/init.d/dropbear')).not.toContain('-G attraccess');
        // Retrying with the same verified generated identity must survive a second cutover.
        success(fixture.run(managedCutoverScript(token, fixture.root)));
        success(fixture.run(managedCommitScript(token, fixture.root)));
        success(fixture.run(`set -- boot\n${managedWatchdogScript(fixture.root)}`));
        expect(fixture.read('etc/init.d/dropbear')).toContain('-G attraccess -w -s');
        expect(fixture.read('password-hashes.json')).not.toContain(password);
        const helper = managedHostHelper(artifact, fixture.root);
        expect(fixture.run(helper, '', Buffer.from(`access-retire ${token}\n`)).status).not.toBe(0);
        expect(fixture.read('home/attraccess/.ssh/authorized_keys')).toContain(replacement.publicKey);
        success(fixture.run(helper, '', Buffer.from(`access-restore ${token}\n`)));
        const previousPolicy = fixture.read('etc/attraccess-wago-management/dropbear.previous');
        fixture.file('etc/attraccess-wago-management/dropbear.previous', '#!/bin/sh\nexit 1\n', 0o700);
        expect(fixture.run(`set -- restore\n${managedWatchdogScript(fixture.root)}`).status).not.toBe(0);
        expect(existsSync(join(fixture.root, 'etc/attraccess-wago-management/cutover'))).toBe(true);
        fixture.file('etc/attraccess-wago-management/dropbear.previous', previousPolicy, 0o700);
        success(fixture.run(`set -- restore\n${managedWatchdogScript(fixture.root)}`));
        // Repeating restoration must not recreate cutover or block key retirement.
        success(fixture.run(helper, '', Buffer.from(`access-restore ${token}\n`)));
        expect(existsSync(join(fixture.root, 'etc/attraccess-wago-management/cutover'))).toBe(false);
        success(fixture.run(helper, '', Buffer.from(`access-retire ${token}\n`)));
        expect(existsSync(join(fixture.root, 'home/attraccess/.ssh/authorized_keys'))).toBe(false);
        expect(existsSync(join(fixture.root, 'etc/attraccess-wago-management/key.pending'))).toBe(false);
        success(fixture.run(helper, '', Buffer.from(`access-retire ${token}\n`)));
      } finally {
        fixture.dispose();
      }
    },
  );

  it.each(['', 'supervisor-lock-held', 'bootstrap-refresh'])(
    'accepts real commissioning journals in dependency order and fences foreign tokens before cleanup (%s)',
    (lockState) => {
      const fixture = fw31ShellFixture();
      try {
        fixture.file('bin/id', '#!/bin/sh\necho 0\n', 0o700);
        const token = 'a'.repeat(32);
        const success = (result: ReturnType<typeof fixture.run>) =>
          expect({
            status: result.status,
            stderr: result.stderr,
            failure: result.stdout.match(/WAGO_MANAGEMENT_FAILURE=([a-z]+)/)?.[1],
          }).toEqual({ status: 0, stderr: '', failure: undefined });
        fixture.file('bundle/image-reference', artifact.image + '\n');
        fixture.file('bundle/image.tar', 'compressed fixture image');
        const archive = join(fixture.root, 'tmp/install.tar');
        expect(
          spawnSync('/usr/bin/tar', [
            '-cf',
            archive,
            '-C',
            join(fixture.root, 'bundle'),
            'image-reference',
            'image.tar',
          ]).status,
        ).toBe(0);
        const bundle = readFileSync(archive);
        fixture.file('etc/attraccess-wago/docker-provision/token', token + '\n');
        fixture.file('etc/attraccess-wago/docker-provision/mode', 'destructive\n');
        fixture.file('etc/attraccess-wago/docker-provision/started', '');
        success(
          fixture.run(
            runtimeBundleDeliveryScript(
              artifact.image,
              'MQTT=permanent',
              null,
              bundle.length,
              createHash('sha256').update(bundle).digest('hex'),
              token,
              fixture.root,
            ),
            '',
            bundle,
          ),
        );
        const helper = managedHostHelper(artifact, fixture.root);
        const management = { token: 'c'.repeat(32), helper, watchdog: managedWatchdogScript(fixture.root) };
        if (lockState === 'bootstrap-refresh') {
          fixture.file('etc/attraccess-wago-management/token', management.token + '\n');
          fixture.file('etc/attraccess-wago-management/watchdog', '#!/bin/sh\nexit 43\n', 0o700);
          fixture.file('usr/sbin/attraccess-wago-management', '#!/bin/sh\nexit 42\n', 0o700);
          expect(
            fixture.run(
              commissioningAcceptanceScript(token, fixture.root, false, { ...management, token: 'd'.repeat(32) }),
            ).status,
          ).not.toBe(0);
          expect(existsSync(join(fixture.root, 'var/lib/attraccess-wago-install-transaction/started'))).toBe(true);
          expect(fixture.read('etc/attraccess-wago-management/watchdog')).toContain('exit 43');
        }
        const acceptance =
          lockState === 'bootstrap-refresh'
            ? commissioningAcceptanceScript(token, fixture.root, false, management)
            : helper;
        const input = lockState === 'bootstrap-refresh' ? undefined : Buffer.from(`commissioning-accept ${token}\n`);
        expect(fixture.run(helper, '', Buffer.from(`commissioning-accept ${'b'.repeat(32)}\n`)).status).not.toBe(0);
        expect(existsSync(join(fixture.root, 'var/lib/attraccess-wago-install-transaction/started'))).toBe(true);
        const bounded = fixture.run(acceptance, 'lock-wait-expired', input);
        expect(bounded.status).not.toBe(0);
        expect(existsSync(join(fixture.root, 'var/lib/attraccess-wago-install-transaction/started'))).toBe(true);
        success(fixture.run(acceptance, lockState, input));
        if (lockState === 'bootstrap-refresh') {
          expect(fixture.read('usr/sbin/attraccess-wago-management')).toBe(helper);
          expect(fixture.read('etc/attraccess-wago-management/watchdog')).toBe(management.watchdog);
        }
        expect(existsSync(join(fixture.root, 'var/lib/attraccess-wago-install-transaction'))).toBe(false);
        expect(existsSync(join(fixture.root, `etc/attraccess-wago/docker-provision.completed-${token}/accepted`))).toBe(
          true,
        );
        success(fixture.run(helper, '', Buffer.from(`commissioning-accept ${token}\n`)));
        expect(fixture.containers()[0]).toMatchObject({ running: true });
        expect(fixture.read('etc/attraccess-wago/runtime.env')).toBe('MQTT=permanent');
      } finally {
        fixture.dispose();
      }
    },
  );

  it.each(['native', 'terse'] as const)(
    'executes a full repeated image update through only the fixed dispatcher, preserving enrolled state (%s stat)',
    (statStyle) => {
      const fixture = fw31ShellFixture(statStyle);
      try {
        fixture.file('bin/id', '#!/bin/sh\necho 0\n', 0o700);
        fixture.file('etc/attraccess-wago/runtime.env', 'WAGO_MQTT_PASSWORD=permanent-fixture-secret');
        fixture.file('etc/attraccess-wago/runtime-enabled', '');
        fixture.file('etc/attraccess-wago/install.lock', '');
        fixture.file('var/lib/attraccess-wago/state.json', 'enrolled-state');
        fixture.file(
          'owners.json',
          JSON.stringify({ ...JSON.parse(fixture.read('owners.json')), '/var/lib/attraccess-wago': '10001:10001' }),
        );
        fixture.setContainers([
          {
            id: 'old-id',
            name: 'attraccess-wago',
            running: true,
            restart: 'no',
            imageId: `sha256:${'9'.repeat(64)}`,
            mounts: [fixture.root + WAGO_DIN, fixture.root + WAGO_DOUT],
          },
        ]);
        fixture.file('loaded-image-id', artifact.imageId);
        fixture.file('bundle/image-reference', artifact.image + '\n');
        fixture.file('bundle/image.tar', 'compressed image fixture');
        const file = join(fixture.root, 'tmp/update.tar');
        expect(
          spawnSync('/usr/bin/tar', ['-cf', file, '-C', join(fixture.root, 'bundle'), 'image-reference', 'image.tar'])
            .status,
        ).toBe(0);
        const bundle = readFileSync(file),
          digest = createHash('sha256').update(bundle).digest('hex');
        const helper = managedHostHelper(artifact, fixture.root),
          token = '5'.repeat(32);
        const run = (header: string, bytes = Buffer.alloc(0)) =>
          fixture.run(helper, '', Buffer.concat([Buffer.from(header + '\n'), bytes]));
        const success = (result: ReturnType<typeof run>) =>
          expect({
            status: result.status,
            stderr: result.stderr,
            failure: result.stdout.match(/WAGO_MANAGEMENT_FAILURE=([a-z]+)/)?.[1],
          }).toEqual({ status: 0, stderr: '', failure: undefined });
        success(run(`proof ${token}`));
        expect(run(`stage ${token} ${digest} ${bundle.length} ${artifact.imageId} arbitrary-image`).status).not.toBe(0);
        success(run(`stage ${token} ${digest} ${bundle.length} ${artifact.imageId} ${artifact.image}`, bundle));
        expect(run(`activate ${'6'.repeat(32)}`).status).not.toBe(0);
        success(run(`activate ${token}`));
        success(run(`accept ${token}`));
        success(run(`acknowledge ${token}`));
        success(run(`acknowledge ${token}`));
        expect(fixture.read('var/lib/attraccess-wago/state.json')).toBe('enrolled-state');
        expect(fixture.read('etc/attraccess-wago/runtime.env')).toContain('permanent-fixture-secret');
        expect(fixture.containers()).toHaveLength(1);
        expect(fixture.containers()[0]).toMatchObject({ imageId: artifact.imageId, running: true });
      } finally {
        fixture.dispose();
      }
    },
  );

  it('generates valid POSIX shell with dynamic bounded artifact parameters, no supplied scripts/eval', () => {
    const helper = managedHostHelper(artifact);
    const key = generateManagementKey();
    for (const script of [
      helper,
      managedProvisionScript('a'.repeat(32), key.publicKey, 'b'.repeat(43), helper),
      managedCutoverScript('a'.repeat(32)),
      managedCommitScript('a'.repeat(32)),
      managedAccessWatchdog,
    ]) {
      const result = spawnSync('/bin/sh', ['-n'], { input: script, encoding: 'utf8' });
      expect({
        status: result.status,
        stderr: result.stderr,
        failure: result.stdout.match(/WAGO_MANAGEMENT_FAILURE=([a-z]+)/)?.[1],
      }).toEqual({ status: 0, stderr: '', failure: undefined });
    }
    expect(helper).toContain('sh "$tx/bundle.tar" "$((bytes + 1))"');
    expect(helper).toContain('-v b="$kib"');
    expect(helper).toContain('"${token}"');
    expect(helper).not.toMatch(/\beval\b|\b1234567\b|'\$\{token\}'/);
    expect(helper).toContain('*) exit 1 ;;');
  });

  it('migrates credential/update/operation storage together and refuses destructive downgrade with credentials', async () => {
    const db = await new DataSource({
      type: 'sqlite',
      database: ':memory:',
      entities: [WagoManagedAccess, WagoRuntimeUpdateEntity, WagoDeviceOperation],
      migrations: [WagoManagedUpdates1780010650000],
    }).initialize();
    try {
      await db.runMigrations();
      await db.query(
        "INSERT INTO plugin_wago_managed_access VALUES (1, NULL, '10.0.0.1', 'pin', 'token', 'pending', 'ciphertext', 'key-pin')",
      );
      await expect(db.undoLastMigration()).rejects.toThrow('Retire managed');
    } finally {
      await db.destroy();
    }
  });
});
