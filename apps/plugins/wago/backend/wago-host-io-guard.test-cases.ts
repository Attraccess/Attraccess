import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { HostDigitalOutputAndIdentityGuardTestScope } from './wago-host-io-guard.spec';
import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';

export function registerChecksOwnershipOnlyWhenGrantingAnExemptionWhileStillObservingEveryProcessAndDescriptor(
  scope: HostDigitalOutputAndIdentityGuardTestScope,
): void {
  it('checks ownership only when granting an exemption, while still observing every process and descriptor', () => {
    scope.owned();
    scope.host.processRecord(23);
    scope.host.fd(23, '0100000');
    scope.host.processRecord(24);
    scope.host.file('unrelated-file', '');
    scope.host.fd(24, '0100002', 'unrelated-file');
    expect(scope.host.run(true).status).toBe(0);
    const observations = readFileSync(join(scope.host.root, 'observations'), 'utf8').trim().split('\n');
    for (const pid of [1, 23, 24]) {
      expect(observations.filter((path) => path === `/proc/${pid}/stat`)).toHaveLength(2);
      expect(observations).toContain(`/proc/${pid}/status`);
      expect(observations).not.toContain(`/proc/${pid}/uid_map`);
      expect(observations).not.toContain(`/proc/${pid}/cgroup`);
    }
    expect(observations).toContain('/proc/23/fdinfo/5');
    expect(observations.filter((path) => path === '/proc/22/cgroup')).toHaveLength(2);
  });
}

export function registerDoesNotSpawnMetadataParsersForASDescriptor(
  scope: HostDigitalOutputAndIdentityGuardTestScope,
): void {
  it.each(['directory', 'pipe'])('does not spawn metadata parsers for a %s descriptor', (kind) => {
    scope.host.processRecord(22);
    if (kind === 'pipe') expect(spawnSync('mkfifo', [join(scope.host.root, 'pipe')]).status).toBe(0);
    scope.host.fd(22, '0100001', kind === 'directory' ? 'proc' : 'pipe');
    // Any external stat of this FD fails. Its kernel file type already proves
    // it cannot alias the regular sysfs DOUT register, so no parser is needed.
    expect(scope.host.run(false, 'fd-unreadable').status).toBe(0);
  });
}

export function registerFailsClosedForAnUnobservableHostAccountDatabaseOrAlternateNssSource(
  scope: HostDigitalOutputAndIdentityGuardTestScope,
): void {
  it('fails closed for an unobservable host account database or alternate NSS source', () => {
    scope.host.file('etc/nsswitch.conf', 'passwd: files ldap\ngroup: files\n');
    scope.rejected('host-io-observation-failed');
    rmSync(join(scope.host.root, 'etc/nsswitch.conf'));
    rmSync(join(scope.host.root, 'etc/group'));
    scope.rejected('host-io-observation-failed');
  });
}

export function registerFailsClosedWhenALiveOutputDescriptorHasMissingOrAmbiguousAccessFlags(
  scope: HostDigitalOutputAndIdentityGuardTestScope,
): void {
  it('fails closed when a live output descriptor has missing or ambiguous access flags', () => {
    scope.host.processRecord(22);
    scope.host.fd(22, '0100001');
    scope.host.file('proc/22/fdinfo/5', 'pos: 0\n');
    scope.rejected('host-io-observation-failed');
    scope.host.file('proc/22/fdinfo/5', 'flags: 0100000\nflags: 0100001\n');
    scope.rejected('host-io-observation-failed');
  });
}

export function registerPermitsReadOnlyDescriptorsAndUnrelatedWritableFiles(
  scope: HostDigitalOutputAndIdentityGuardTestScope,
): void {
  it('permits read-only descriptors and unrelated writable files', () => {
    scope.host.processRecord(22);
    scope.host.fd(22, '0100000');
    scope.host.file('other-file', '');
    scope.host.processRecord(23);
    scope.host.fd(23, '0100002', 'other-file');
    expect(scope.host.run().status).toBe(0);
  });
}

export function registerPermitsVerifiedContainerDescendantsAndCgroupV1DockerMembership(
  scope: HostDigitalOutputAndIdentityGuardTestScope,
): void {
  it('permits verified container descendants and cgroup-v1 Docker membership', () => {
    scope.owned(`11:memory:/docker/${scope.containerId}\n10:cpu,cpuacct:/docker/${scope.containerId}\n`);
    scope.host.processRecord(
      23,
      'Uid: 10001 10001 10001 10001\nGid: 10001 10001 10001 10001\nGroups:\n',
      `11:memory:/docker/${scope.containerId}/child\n10:cpu,cpuacct:/docker/${scope.containerId}/child\n`,
    );
    scope.host.fd(23, '0100001');
    expect(scope.host.run(true).status).toBe(0);
  });
}

export function registerRejectsEveryRealEffectiveSavedAndFilesystemSCollision(
  scope: HostDigitalOutputAndIdentityGuardTestScope,
): void {
  it.each(['Uid', 'Gid'])('rejects every real, effective, saved and filesystem %s collision', (field) => {
    for (let index = 0; index < 4; index++) {
      const values = Array(4).fill('0');
      values[index] = '10001';
      scope.host.processRecord(
        22,
        `Uid: ${field === 'Uid' ? values.join(' ') : '0 0 0 0'}\nGid: ${field === 'Gid' ? values.join(' ') : '0 0 0 0'}\nGroups: 0\n`,
      );
      scope.rejected('runtime-identity-conflict');
    }
  });
}

export function registerRejectsHostIdentityOwnershipInS(scope: HostDigitalOutputAndIdentityGuardTestScope): void {
  it.each([
    ['etc/passwd', 'unrelated:x:10001:20000::/:/bin/sh\n'],
    ['etc/passwd', 'unrelated:x:20000:10001::/:/bin/sh\n'],
    ['etc/group', 'unrelated:x:10001:\n'],
  ])('rejects host identity ownership in %s', (path, content) => {
    scope.host.file(path, content);
    scope.rejected('runtime-identity-conflict');
  });
}

export function registerRevalidatesIdentityOwnershipAndNewDirectWritersOnSubsequentGates(
  scope: HostDigitalOutputAndIdentityGuardTestScope,
): void {
  it('revalidates identity ownership and new direct writers on subsequent gates', () => {
    scope.owned();
    expect(scope.host.run(true).status).toBe(0);
    scope.host.file('etc/group', 'unrelated:x:10001:\n');
    scope.rejected('runtime-identity-conflict', true);
    scope.host.file('etc/group', 'root:x:0:\n');
    scope.host.processRecord(23);
    scope.host.fd(23, '0100001');
    scope.rejected('output-host-process-conflict', true);
  });
}
