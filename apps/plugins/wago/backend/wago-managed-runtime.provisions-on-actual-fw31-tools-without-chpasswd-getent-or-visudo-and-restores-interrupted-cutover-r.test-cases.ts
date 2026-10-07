import { scryptSync } from 'node:crypto';
import { managedHostHelper } from './wago-managed-helper';
import {
  managedProvisionScript,
  managedCutoverScript,
  managedCommitScript,
  managedWatchdogScript,
} from './wago-managed-provision';
import { generateManagementKey } from './wago-management-key';
import { fw31ShellFixture } from './fixtures/fw31-shell-fixture';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import type { FixedManagedExecutorAndRecoveryProgramsTestScope } from './wago-managed-runtime.spec';
export function registerProvisionsOnActualFw31ToolsWithoutChpasswdGetentOrVisudoAndRestoresInterruptedCutoverR(
  scope: FixedManagedExecutorAndRecoveryProgramsTestScope,
): void {
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
              managedHostHelper(scope.artifact, fixture.root),
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
              managedHostHelper(scope.artifact, fixture.root),
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
              managedHostHelper(scope.artifact, fixture.root),
              fixture.root,
            ),
          ),
        );
        expect(fixture.read('home/attraccess/.ssh/authorized_keys')).toContain(key.publicKey);
        expect(fixture.read('home/attraccess/.ssh/authorized_keys')).toContain(replacement.publicKey);
        success(
          fixture.run(managedHostHelper(scope.artifact, fixture.root), '', Buffer.from(`access-key-commit ${token}\n`)),
        );
        expect(fixture.read('home/attraccess/.ssh/authorized_keys')).not.toContain(key.publicKey);
        expect(fixture.read('home/attraccess/.ssh/authorized_keys')).toContain(replacement.publicKey);
        success(
          fixture.run(managedHostHelper(scope.artifact, fixture.root), '', Buffer.from(`access-key-commit ${token}\n`)),
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
        const helper = managedHostHelper(scope.artifact, fixture.root);
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
}
