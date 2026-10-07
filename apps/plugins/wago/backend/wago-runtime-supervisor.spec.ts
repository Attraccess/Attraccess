import { existsSync, readdirSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { fw31ShellFixture } from './fixtures/fw31-shell-fixture';
import { wagoRuntimeSupervisorAcknowledgeShell, wagoRuntimeSupervisorLaunchShell } from './wago-runtime-supervisor';
import { registerFailsAfterBoundedLaunchAttemptsWithoutAnAcknowledgementAndRemovesItsRequest } from './wago-runtime-supervisor.test-cases';
import { registerWaitsForAComplete174SecondGateWithoutPrematureReadinessOrDuplicateWorkers } from './wago-runtime-supervisor.test-cases';
import { registerLaunchesOnlyOneLiveCandidateThroughADelayedCompleteGate } from './wago-runtime-supervisor.test-cases';
import { registerReplacesAnExitedCandidateWithNoAcknowledgementOnceOwnershipIsAvailable } from './wago-runtime-supervisor.test-cases';
import { registerFailsClosedWhenAcknowledgementExceedsThe330SecondReadyBudget } from './wago-runtime-supervisor.test-cases';
import { registerDoesNotRunUnlockedRollbackOnExhaustedReacquisitionInterruptedS } from './wago-runtime-supervisor.test-cases';
import { registerDefersAnInterruptedRequestUntilTheGateOwnerReleasesTheTransactionLock } from './wago-runtime-supervisor.test-cases';
import { registerAcceptsAnExistingSupervisorAcknowledgementWhenTheSecondLaunchCannotAcquireOwnership } from './wago-runtime-supervisor.test-cases';
import { registerDefersInterruptionDuringHandoffUntilTheCallerCanRunItsLockedRollback } from './wago-runtime-supervisor.test-cases';
import { registerPublishesAPrivateRegularAcknowledgementAndAcceptsARepeatedObservation } from './wago-runtime-supervisor.test-cases';
import { registerDoesNotAcknowledgeARequestThatArrivedAfterTheGateBegan } from './wago-runtime-supervisor.test-cases';
import { registerAllowsTheCallerToConsumeItsRequestImmediatelyAfterTheAcknowledgementIsPublished } from './wago-runtime-supervisor.test-cases';
import { registerRejectsUnsafeAcknowledgementMetadataS } from './wago-runtime-supervisor.test-cases';
import { registerRetainsSupervisionThroughContentionSAndContainsALaterHardwareConflict } from './wago-runtime-supervisor.retains-supervision-through-contention-s-and-contains-a-later-hardware-conflict.test-cases';

describe('bounded runtime supervisor launch acknowledgement', () => {
  defineBoundedRuntimeSupervisorLaunchAcknowledgementTests();
});

describe('runtime supervisor handoff with real advisory locks and processes', () => {
  defineRuntimeSupervisorHandoffWithRealAdvisoryLocksAndProcessesTests();
});

export function defineBoundedRuntimeSupervisorLaunchAcknowledgementTests() {
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
  // Advance only the launcher's requested sleep budget, not wall time. The
  // synthetic owner publishes nothing until its complete gate has finished.
  const controlledHandoff = (gateSeconds: number, lockSeconds = gateSeconds, interrupt = false) => {
    fixture.file('supervisor-fixture-live', '');
    return `
supervisor_fixture_seconds=0
sleep() {
  supervisor_fixture_seconds=$((supervisor_fixture_seconds + $1))
  printf '%s\\n' "$supervisor_fixture_seconds" > "$FIXTURE_ROOT/elapsed"
  for request in "$config"/supervisor-start.*; do
    if test "$supervisor_fixture_seconds" -lt ${gateSeconds}; then
      test ! -e "$request/ready" || exit 99
    else
      printf '%s\\n' "$$" > "$request/ready"
    fi
  done
  ${interrupt ? 'test "$supervisor_fixture_seconds" != 2 || kill -TERM "$$"' : ':'}
}
flock() {
  if test "$2" = 8; then return 1; fi
  test "$supervisor_fixture_seconds" = 0 || test "$supervisor_fixture_seconds" -ge ${lockSeconds}
}
`;
  };

  beforeEach(() => {
    fixture = fw31ShellFixture();
    fixture.file(
      'bin/timeout',
      fixture.read('bin/timeout').replace("['10','30','45']", "['10','30','45','300']"),
      0o700,
    );
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
  const scope = {
    get fixture() {
      return fixture;
    },
    set fixture(value: typeof fixture) {
      fixture = value;
    },
    get config() {
      return config;
    },
    get script() {
      return script;
    },
    get requests() {
      return requests;
    },
    get controlledHandoff() {
      return controlledHandoff;
    },
    get request() {
      return request;
    },
    get owner() {
      return owner;
    },
  };
  afterEach(() => fixture.dispose());

  it('confirms a live supervisor and removes only its acknowledged private request', () => {
    expect(fixture.run(script(wagoRuntimeSupervisorLaunchShell())).status).toBe(0);
    expect(requests()).toEqual([]);
    expect(fixture.read('launches').trim().split('\n').length).toBeLessThanOrEqual(15);
  });

  registerFailsAfterBoundedLaunchAttemptsWithoutAnAcknowledgementAndRemovesItsRequest(scope);

  registerWaitsForAComplete174SecondGateWithoutPrematureReadinessOrDuplicateWorkers(scope);

  registerLaunchesOnlyOneLiveCandidateThroughADelayedCompleteGate(scope);

  registerReplacesAnExitedCandidateWithNoAcknowledgementOnceOwnershipIsAvailable(scope);

  it('allows acknowledgement scheduling after a gate finishes at its 300-second boundary', () => {
    const result = fixture.run(script(controlledHandoff(302, 302) + wagoRuntimeSupervisorLaunchShell()));
    expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
    expect(fixture.read('elapsed')).toBe('302\n');
  });

  registerFailsClosedWhenAcknowledgementExceedsThe330SecondReadyBudget(scope);

  it('allows a separately bounded 174-second lock reacquisition after readiness', () => {
    const result = fixture.run(script(controlledHandoff(2, 176) + wagoRuntimeSupervisorLaunchShell()));
    expect(result.status).toBe(0);
    expect(fixture.read('elapsed')).toBe('176\n');
    expect(requests()).toEqual([]);
  });

  registerDoesNotRunUnlockedRollbackOnExhaustedReacquisitionInterruptedS(scope);

  registerDefersAnInterruptedRequestUntilTheGateOwnerReleasesTheTransactionLock(scope);

  registerAcceptsAnExistingSupervisorAcknowledgementWhenTheSecondLaunchCannotAcquireOwnership(scope);

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

  registerDefersInterruptionDuringHandoffUntilTheCallerCanRunItsLockedRollback(scope);

  registerPublishesAPrivateRegularAcknowledgementAndAcceptsARepeatedObservation(scope);

  registerDoesNotAcknowledgeARequestThatArrivedAfterTheGateBegan(scope);

  registerAllowsTheCallerToConsumeItsRequestImmediatelyAfterTheAcknowledgementIsPublished(scope);

  registerRejectsUnsafeAcknowledgementMetadataS(scope);

  it('rejects a request directory symlink without creating an acknowledgement at its target', () => {
    fixture.file('target/value', 'preserve target');
    symlinkSync(join(fixture.root, 'target'), join(fixture.root, request));
    expect(fixture.run(script(wagoRuntimeSupervisorAcknowledgeShell())).status).not.toBe(0);
    expect(existsSync(join(fixture.root, 'target/ready'))).toBe(false);
  });

  return scope;
}

export type BoundedRuntimeSupervisorLaunchAcknowledgementTestScope = ReturnType<
  typeof defineBoundedRuntimeSupervisorLaunchAcknowledgementTests
>;

export function defineRuntimeSupervisorHandoffWithRealAdvisoryLocksAndProcessesTests() {
  const scope = {};
  registerRetainsSupervisionThroughContentionSAndContainsALaterHardwareConflict(scope);

  return scope;
}

export type RuntimeSupervisorHandoffWithRealAdvisoryLocksAndProcessesTestScope = ReturnType<
  typeof defineRuntimeSupervisorHandoffWithRealAdvisoryLocksAndProcessesTests
>;
