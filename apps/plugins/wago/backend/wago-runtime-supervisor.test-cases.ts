import { wagoRuntimeSupervisorLaunchShell } from './wago-runtime-supervisor';
import type { BoundedRuntimeSupervisorLaunchAcknowledgementTestScope } from './wago-runtime-supervisor.spec';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { wagoRuntimeSupervisorAcknowledgeShell } from './wago-runtime-supervisor';
import { existsSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import { statSync } from 'node:fs';
import { chmodSync } from 'node:fs';
import { linkSync } from 'node:fs';
import { symlinkSync } from 'node:fs';

export function registerAcceptsAnExistingSupervisorAcknowledgementWhenTheSecondLaunchCannotAcquireOwnership(
  scope: BoundedRuntimeSupervisorLaunchAcknowledgementTestScope,
): void {
  it('accepts an existing supervisor acknowledgement when the second launch cannot acquire ownership', () => {
    scope.fixture.file(
      'bin/sleep',
      `#!${process.execPath}
const fs=require('node:fs'),config=process.env.FIXTURE_ROOT+'/${scope.config}';
fs.writeFileSync(process.env.FIXTURE_ROOT+'/supervisor-fixture-live','');
for(const name of fs.readdirSync(config).filter(name=>name.startsWith('supervisor-start.')))
 fs.writeFileSync(config+'/'+name+'/ready',String(process.ppid),{mode:0o600});
`,
      0o700,
    );
    expect(scope.fixture.run(scope.script(wagoRuntimeSupervisorLaunchShell()), 'supervisor-launch-failed').status).toBe(
      0,
    );
    expect(scope.requests()).toEqual([]);
  });
}

export function registerAllowsTheCallerToConsumeItsRequestImmediatelyAfterTheAcknowledgementIsPublished(
  scope: BoundedRuntimeSupervisorLaunchAcknowledgementTestScope,
): void {
  it('allows the caller to consume its request immediately after the acknowledgement is published', () => {
    scope.fixture.file(scope.request + '/request', '');
    rmSync(join(scope.fixture.root, 'bin/mv'));
    scope.fixture.file(
      'bin/mv',
      `#!${process.execPath}
const fs=require('node:fs'),root=process.env.FIXTURE_ROOT,args=process.argv.slice(2);
if(args.at(-1)!==root+'/${scope.request}/ready')process.exit(99);
const moved=require('node:child_process').spawnSync('/bin/mv',args);
if(moved.status!==0)process.exit(1);
fs.rmSync(root+'/${scope.request}',{recursive:true});
`,
      0o700,
    );
    expect(scope.fixture.run(scope.script(wagoRuntimeSupervisorAcknowledgeShell())).status).toBe(0);
    expect(scope.requests()).toEqual([]);
  });
}

export function registerDefersAnInterruptedRequestUntilTheGateOwnerReleasesTheTransactionLock(
  scope: BoundedRuntimeSupervisorLaunchAcknowledgementTestScope,
): void {
  it('defers an interrupted request until the gate owner releases the transaction lock', () => {
    const result = scope.fixture.run(
      scope.script(
        scope.controlledHandoff(174, 174, true) +
          `
trap 'flock -n 9 && echo rollback-with-lock' EXIT
${wagoRuntimeSupervisorLaunchShell()}`,
      ),
    );
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('rollback-with-lock\n');
    expect(scope.fixture.read('elapsed')).toBe('174\n');
    expect(scope.requests()).toEqual([]);
  });
}

export function registerDefersInterruptionDuringHandoffUntilTheCallerCanRunItsLockedRollback(
  scope: BoundedRuntimeSupervisorLaunchAcknowledgementTestScope,
): void {
  it('defers interruption during handoff until the caller can run its locked rollback', () => {
    scope.fixture.file('bin/sleep', `#!${process.execPath}\nprocess.kill(process.ppid,'SIGTERM');\n`, 0o700);
    const result = scope.fixture.run(
      scope.script(`trap ': >&9 && echo rollback-with-lock' EXIT\n${wagoRuntimeSupervisorLaunchShell()}`),
    );
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('rollback-with-lock\n');
    expect(scope.requests()).toEqual([]);
  });
}

export function registerDoesNotAcknowledgeARequestThatArrivedAfterTheGateBegan(
  scope: BoundedRuntimeSupervisorLaunchAcknowledgementTestScope,
): void {
  it('does not acknowledge a request that arrived after the gate began', () => {
    scope.fixture.file(scope.request + '/request', '');
    expect(
      scope.fixture.run(
        scope.script(`set -- "$config/supervisor-start.earlier"\n${wagoRuntimeSupervisorAcknowledgeShell()}`),
      ).status,
    ).toBe(0);
    expect(existsSync(join(scope.fixture.root, scope.request, 'ready'))).toBe(false);
  });
}

export function registerDoesNotRunUnlockedRollbackOnExhaustedReacquisitionInterruptedS(
  scope: BoundedRuntimeSupervisorLaunchAcknowledgementTestScope,
): void {
  it.each([false, true])('does not run unlocked rollback on exhausted reacquisition (interrupted: %s)', (interrupt) => {
    const result = scope.fixture.run(
      scope.script(
        scope.controlledHandoff(2, 304, interrupt) +
          `
trap 'echo unsafe-rollback' EXIT
${wagoRuntimeSupervisorLaunchShell()}`,
      ),
    );
    expect(result.status).toBe(75);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Runtime supervisor handoff lock unverified; recovery required');
    expect(scope.fixture.read('elapsed')).toBe('302\n');
    expect(scope.requests()).toEqual([]);
  });
}

export function registerFailsAfterBoundedLaunchAttemptsWithoutAnAcknowledgementAndRemovesItsRequest(
  scope: BoundedRuntimeSupervisorLaunchAcknowledgementTestScope,
): void {
  it('fails after bounded launch attempts without an acknowledgement and removes its request', () => {
    // No existing owner in this case. Other tests exercise lock validation;
    // avoid 165 external metadata probes just to count replacement launches.
    rmSync(join(scope.fixture.root, scope.config, 'supervisor.lock'));
    const result = scope.fixture.run(
      scope.script(`
nohup() { printf 'launch\\n' >> "$FIXTURE_ROOT/launches"; }
sleep() { wait; }
${wagoRuntimeSupervisorLaunchShell()}`),
    );
    expect(result.stderr).toContain('Runtime supervisor launch unverified');
    expect(result.status).not.toBe(0);
    expect(scope.requests()).toEqual([]);
    expect(scope.fixture.read('launches').trim().split('\n')).toHaveLength(165);
  });
}

export function registerFailsClosedWhenAcknowledgementExceedsThe330SecondReadyBudget(
  scope: BoundedRuntimeSupervisorLaunchAcknowledgementTestScope,
): void {
  it('fails closed when acknowledgement exceeds the 330-second ready budget', () => {
    const result = scope.fixture.run(
      scope.script(scope.controlledHandoff(332, 330) + wagoRuntimeSupervisorLaunchShell()),
    );
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Runtime supervisor launch unverified');
    expect(scope.fixture.read('elapsed')).toBe('330\n');
    expect(existsSync(join(scope.fixture.root, 'launches'))).toBe(false);
    expect(scope.requests()).toEqual([]);
  });
}

export function registerLaunchesOnlyOneLiveCandidateThroughADelayedCompleteGate(
  scope: BoundedRuntimeSupervisorLaunchAcknowledgementTestScope,
): void {
  it('launches only one live candidate through a delayed complete gate', () => {
    const result = scope.fixture.run(
      scope.script(`
supervisor_fixture_seconds=0
nohup() {
  printf 'launch\\n' >> "$FIXTURE_ROOT/launches"
  : > "$FIXTURE_ROOT/candidate-started"
  while test ! -f "$FIXTURE_ROOT/complete-gate"; do :; done
  : > "$FIXTURE_ROOT/supervisor-fixture-live"
  for request in "$config"/supervisor-start.*; do
    printf '%s\\n' "$$" > "$request/ready"
  done
}
sleep() {
  while test ! -f "$FIXTURE_ROOT/candidate-started"; do :; done
  supervisor_fixture_seconds=$((supervisor_fixture_seconds + $1))
  printf '%s\\n' "$supervisor_fixture_seconds" > "$FIXTURE_ROOT/elapsed"
  if test "$supervisor_fixture_seconds" -ge 174; then
    : > "$FIXTURE_ROOT/complete-gate"
    wait
  else
    for request in "$config"/supervisor-start.*; do test ! -e "$request/ready" || exit 99; done
  fi
}
${wagoRuntimeSupervisorLaunchShell()}`),
    );
    expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
    expect(scope.fixture.read('elapsed')).toBe('174\n');
    expect(scope.fixture.read('launches')).toBe('launch\n');
    expect(scope.requests()).toEqual([]);
  });
}

export function registerPublishesAPrivateRegularAcknowledgementAndAcceptsARepeatedObservation(
  scope: BoundedRuntimeSupervisorLaunchAcknowledgementTestScope,
): void {
  it('publishes a private regular acknowledgement and accepts a repeated observation', () => {
    scope.fixture.file(scope.request + '/request', '');
    const acknowledge = scope.script(wagoRuntimeSupervisorAcknowledgeShell());
    expect(scope.fixture.run(acknowledge).status).toBe(0);
    expect(statSync(join(scope.fixture.root, scope.request, 'ready')).mode & 0o777).toBe(0o600);
    expect(scope.fixture.run(acknowledge).status).toBe(0);
    expect(readdirSync(join(scope.fixture.root, scope.request))).toEqual(['ready', 'request']);
  });
}

export function registerRejectsUnsafeAcknowledgementMetadataS(
  scope: BoundedRuntimeSupervisorLaunchAcknowledgementTestScope,
): void {
  it.each(['directory-owner', 'directory-mode', 'ready-owner', 'ready-mode', 'ready-symlink', 'ready-hardlink'])(
    'rejects unsafe acknowledgement metadata: %s',
    (fault) => {
      scope.fixture.file(scope.request + '/request', '');
      if (fault === 'directory-owner') scope.owner(scope.request, '10001:10001');
      if (fault === 'directory-mode') chmodSync(join(scope.fixture.root, scope.request), 0o777);
      if (fault === 'ready-owner' || fault === 'ready-mode') scope.fixture.file(scope.request + '/ready', '');
      if (fault === 'ready-owner') scope.owner(scope.request + '/ready', '10001:10001');
      if (fault === 'ready-mode') chmodSync(join(scope.fixture.root, scope.request, 'ready'), 0o666);
      if (fault === 'ready-symlink' || fault === 'ready-hardlink') {
        scope.fixture.file('target', 'preserve target');
        const link = fault === 'ready-symlink' ? symlinkSync : linkSync;
        link(join(scope.fixture.root, 'target'), join(scope.fixture.root, scope.request, 'ready'));
      }
      expect(scope.fixture.run(scope.script(wagoRuntimeSupervisorAcknowledgeShell())).status).not.toBe(0);
      if (existsSync(join(scope.fixture.root, 'target'))) expect(scope.fixture.read('target')).toBe('preserve target');
    },
  );
}

export function registerReplacesAnExitedCandidateWithNoAcknowledgementOnceOwnershipIsAvailable(
  scope: BoundedRuntimeSupervisorLaunchAcknowledgementTestScope,
): void {
  it('replaces an exited candidate with no acknowledgement once ownership is available', () => {
    scope.fixture.file(
      'bin/nohup',
      scope.fixture
        .read('bin/nohup')
        .replace(
          "if(fault==='supervisor-launch-failed')process.exit(1);",
          "if(fs.readFileSync(root+'/launches','utf8')==='launch\\n')process.exit(1);",
        ),
    );
    const result = scope.fixture.run(scope.script(wagoRuntimeSupervisorLaunchShell()));
    expect(result.status).toBe(0);
    expect(scope.fixture.read('launches')).toBe('launch\nlaunch\n');
    expect(scope.requests()).toEqual([]);
  });
}

export function registerWaitsForAComplete174SecondGateWithoutPrematureReadinessOrDuplicateWorkers(
  scope: BoundedRuntimeSupervisorLaunchAcknowledgementTestScope,
): void {
  it('waits for a complete 174-second gate without premature readiness or duplicate workers', () => {
    const result = scope.fixture.run(scope.script(scope.controlledHandoff(174) + wagoRuntimeSupervisorLaunchShell()));
    expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
    expect(scope.fixture.read('elapsed')).toBe('174\n');
    expect(existsSync(join(scope.fixture.root, 'launches'))).toBe(false);
    expect(scope.requests()).toEqual([]);
  });
}
