import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { generateManagementKey } from './wago-management-key';
import { parseManagementInspection } from './wago-management-inspection';
import { managementKeyCommand, ManagementShellAction } from './wago-management-shell';
import { registerAddsOnlyTheGeneratedPublicKeyPreservesTheSnapshotAndRestoresExactlyOnExplicitRecovery } from './wago-management-shell.a-crash-before-token-publication-leaves-no-active-journal-and-permits-a-fresh-prepare.test-cases';
import { registerRemovesANewlyCreatedAuthorizedKeysFileOnRollback } from './wago-management-shell.rejects-apply-commit-and-rearming-after-the-persisted-deadline-even-without-a-watchdog.test-cases';
import { registerRetainsTheJournalAndRefusesRollbackWhenAnAdministratorChangesKeysConcurrently } from './wago-management-shell.rejects-apply-commit-and-rearming-after-the-persisted-deadline-even-without-a-watchdog.test-cases';
import { registerAForeignTransactionAndUnsafePermissionsOrSymlinksCannotOverwriteKeys } from './wago-management-shell.a-crash-before-token-publication-leaves-no-active-journal-and-permits-a-fresh-prepare.test-cases';
import { registerRollbackHandlesInterruptionBeforeTheKeyRename } from './wago-management-shell.rejects-apply-commit-and-rearming-after-the-persisted-deadline-even-without-a-watchdog.test-cases';
import { registerIndependentWatchdogSurvivesTheArmCommandExitingAndRestoresAnUncommittedKey } from './wago-management-shell.a-crash-before-token-publication-leaves-no-active-journal-and-permits-a-fresh-prepare.test-cases';
import { registerRetriesWatchdogLockContentionBeyondTheFirstFiveSecondWait } from './wago-management-shell.rejects-apply-commit-and-rearming-after-the-persisted-deadline-even-without-a-watchdog.test-cases';
import { registerReservesAppendSpaceAndRollsBackAnInstalledImageOfExactly65536Bytes } from './wago-management-shell.rejects-apply-commit-and-rearming-after-the-persisted-deadline-even-without-a-watchdog.test-cases';
import { registerRefusesAnAppendThatWouldOverflowIExistingBytes } from './wago-management-shell.a-crash-before-token-publication-leaves-no-active-journal-and-permits-a-fresh-prepare.test-cases';
import { registerACrashBeforeTokenPublicationLeavesNoActiveJournalAndPermitsAFreshPrepare } from './wago-management-shell.a-crash-before-token-publication-leaves-no-active-journal-and-permits-a-fresh-prepare.test-cases';
import { registerRejectsApplyCommitAndRearmingAfterThePersistedDeadlineEvenWithoutAWatchdog } from './wago-management-shell.rejects-apply-commit-and-rearming-after-the-persisted-deadline-even-without-a-watchdog.test-cases';
import { registerRefusesCommitAfterExpiryEvenWhenTheInstalledImageIsUnchanged } from './wago-management-shell.a-crash-before-token-publication-leaves-no-active-journal-and-permits-a-fresh-prepare.test-cases';
import { registerBoundsWatchdogRetriesAndLeavesRecoveryPossibleAfterExhaustingContention } from './wago-management-shell.a-crash-before-token-publication-leaves-no-active-journal-and-permits-a-fresh-prepare.test-cases';
import { registerKillsAnInFlightInstallAtItsRemoteDeadlineAndLeavesItRecoverable } from './wago-management-shell.a-crash-before-token-publication-leaves-no-active-journal-and-permits-a-fresh-prepare.test-cases';
import { registerInMemoryKeysAreUniqueInternallyValidatedAndAcceptedByTheActualLocalOpenSshParser } from './wago-management-shell.a-crash-before-token-publication-leaves-no-active-journal-and-permits-a-fresh-prepare.test-cases';
import { registerExecutesTheReadOnlyDetectorOnAFakeProcEtcTreeAndNeverInvokesServiceBinaries } from './wago-management-shell.a-crash-before-token-publication-leaves-no-active-journal-and-permits-a-fresh-prepare.test-cases';
import { registerGatesDropbearEnrollmentByLiveVersionFirmwareAndNonRootIdentitySSSS } from './wago-management-shell.a-crash-before-token-publication-leaves-no-active-journal-and-permits-a-fresh-prepare.test-cases';
import { registerDoesNotAttemptRootProcessExecutableReadsOrExecuteAnInstalledDaemonToInferItsVersion } from './wago-management-shell.a-crash-before-token-publication-leaves-no-active-journal-and-permits-a-fresh-prepare.test-cases';

const exec = promisify(execFile);
const token = '1234567890abcdef1234567890abcdef';
const key = generateManagementKey();
const keyEntry = `no-agent-forwarding,no-port-forwarding,no-pty,no-X11-forwarding ${key.publicKey}`;
let root: string, home: string, bin: string;
let watchdogPid: number | undefined;
const path = (...parts: string[]) => join(home, '.ssh', ...parts);
const env = () => ({ ...process.env, HOME: home, PATH: `${bin}:${process.env.PATH}` });
const command = (action: ManagementShellAction, seconds = 180, selectedToken = token) =>
  managementKeyCommand(action, selectedToken, seconds, key.publicKey)
    .replaceAll('/proc/uptime', join(root, 'uptime'))
    .replaceAll('/proc/sys/kernel/random/boot_id', join(root, 'boot-id'));
const run = (action: ManagementShellAction, seconds = 180, selectedToken = token) =>
  exec('/bin/sh', ['-c', command(action, seconds, selectedToken)], {
    env: env(),
    timeout: 10000,
    maxBuffer: 16384,
  });

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'wago-management-fixture-'));
  home = join(root, 'home');
  bin = join(root, 'bin');
  watchdogPid = undefined;
  await mkdir(home, { mode: 0o700 });
  await mkdir(bin, { mode: 0o700 });
  await mkdir(path(), { mode: 0o700 });
  await writeFile(join(root, 'uptime'), '1000.00 0.00\n');
  await writeFile(join(root, 'boot-id'), 'fixture-boot\n');
  // Isolated Linux utility fixtures for macOS. No device/network/system service commands.
  const python = (await exec('/bin/sh', ['-c', 'command -v python3'])).stdout.trim();
  const shim = `#!${python}
import os,sys,stat,fcntl,time,subprocess,signal
name=os.path.basename(sys.argv[0])
if name=='stat':
 # Map the initialization probe to the isolated fixture root, never the host root.
 p=os.path.dirname(os.environ['HOME']) if sys.argv[-1]=='/' else sys.argv[-1]
 s=(os.stat if sys.argv[1]=='-Lc' else os.lstat)(p); fmt=sys.argv[2]; print(fmt.replace('%u',str(s.st_uid)).replace('%g',str(s.st_gid)).replace('%a',format(stat.S_IMODE(s.st_mode),'o')).replace('%h',str(s.st_nlink)))
elif name=='flock':
 end=time.monotonic()+float(sys.argv[2])
 while True:
  try:
   fcntl.flock(int(sys.argv[-1]),fcntl.LOCK_EX|fcntl.LOCK_NB)
   break
  except BlockingIOError:
   if time.monotonic()>=end:
    with open(os.path.join(os.environ['HOME'],'flock-timeouts'),'a') as log: log.write('timeout\\n')
    sys.exit(1)
   time.sleep(0.02)
elif name=='timeout':
 assert sys.argv[1:3]==['-s','KILL']
 os.setpgid(0,0)
 child=subprocess.Popen(sys.argv[4:],close_fds=False)
 try: sys.exit(child.wait(timeout=float(sys.argv[3])))
 except subprocess.TimeoutExpired: os.killpg(os.getpid(),signal.SIGKILL)
`;
  for (const tool of ['stat', 'flock', 'timeout']) await writeFile(join(bin, tool), shim, { mode: 0o700 });
});
afterEach(async () => {
  if (watchdogPid) {
    try {
      process.kill(watchdogPid, 'SIGTERM');
    } catch {
      /* already completed */
    }
  }
  await rm(root, { recursive: true, force: true });
});

async function prepared() {
  await writeFile(path('authorized_keys'), '# existing key\n', { mode: 0o600 });
  await run('prepare');
  // Most tests inject the independent-watchdog acknowledgement; one below launches the real child.
  await writeFile(path('.attraccess-management-transaction', 'armed'), '');
}

describe('executable isolated management shell fixtures', () => {
  defineExecutableIsolatedManagementShellFixturesTests();
});

async function waitFor(predicate: () => Promise<boolean>, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('fixture wait timed out');
}

export function defineExecutableIsolatedManagementShellFixturesTests() {
  // These fixtures spawn real tools while modelling remote time/uptime. Keep
  const scope = {
    prepared,
    get run() {
      return run;
    },
    get path() {
      return path;
    },
    get keyEntry() {
      return keyEntry;
    },
    get key() {
      return key;
    },
    get token() {
      return token;
    },
    get root() {
      return root;
    },
    set root(value: typeof root) {
      root = value;
    },
    get watchdogPid() {
      return watchdogPid;
    },
    set watchdogPid(value: typeof watchdogPid) {
      watchdogPid = value;
    },
    get exec() {
      return exec;
    },
    get env() {
      return env;
    },
    waitFor,
    get home() {
      return home;
    },
    set home(value: typeof home) {
      home = value;
    },
    get bin() {
      return bin;
    },
    set bin(value: typeof bin) {
      bin = value;
    },
  };
  // their wall-clock budget separate from the asserted deadline/retry bounds.
  jest.setTimeout(30000);
  registerAddsOnlyTheGeneratedPublicKeyPreservesTheSnapshotAndRestoresExactlyOnExplicitRecovery(scope);

  registerRemovesANewlyCreatedAuthorizedKeysFileOnRollback(scope);

  registerRetainsTheJournalAndRefusesRollbackWhenAnAdministratorChangesKeysConcurrently(scope);

  registerAForeignTransactionAndUnsafePermissionsOrSymlinksCannotOverwriteKeys(scope);

  registerRollbackHandlesInterruptionBeforeTheKeyRename(scope);

  registerIndependentWatchdogSurvivesTheArmCommandExitingAndRestoresAnUncommittedKey(scope);

  registerRetriesWatchdogLockContentionBeyondTheFirstFiveSecondWait(scope);

  registerReservesAppendSpaceAndRollsBackAnInstalledImageOfExactly65536Bytes(scope);

  registerRefusesAnAppendThatWouldOverflowIExistingBytes(scope);

  registerACrashBeforeTokenPublicationLeavesNoActiveJournalAndPermitsAFreshPrepare(scope);

  registerRejectsApplyCommitAndRearmingAfterThePersistedDeadlineEvenWithoutAWatchdog(scope);

  it('refuses an old deadline after a controller reboot', async () => {
    await prepared();
    await writeFile(join(root, 'boot-id'), 'new-boot\n');
    await expect(run('install')).rejects.toBeDefined();
    await run('rollback');
  });

  registerRefusesCommitAfterExpiryEvenWhenTheInstalledImageIsUnchanged(scope);

  registerBoundsWatchdogRetriesAndLeavesRecoveryPossibleAfterExhaustingContention(scope);

  registerKillsAnInFlightInstallAtItsRemoteDeadlineAndLeavesItRecoverable(scope);

  it('rejects shell-injection keys, tokens and arbitrary actions before execution', () => {
    expect(() => managementKeyCommand('install', token, 180, `${key.publicKey}\ncommand`)).toThrow('invalid_key');
    expect(() => managementKeyCommand('prepare', "';touch /tmp/pwn")).toThrow('invalid_transaction');
    expect(() => managementKeyCommand('custom' as never, token)).toThrow('invalid_action');
  });

  registerInMemoryKeysAreUniqueInternallyValidatedAndAcceptedByTheActualLocalOpenSshParser(scope);

  registerExecutesTheReadOnlyDetectorOnAFakeProcEtcTreeAndNeverInvokesServiceBinaries(scope);

  it('reports mixed/unknown daemons and BSP-only firmware conservatively; rejects oversized/raw output', () => {
    const inspection = parseManagementInspection('BEGIN=1\nFW=bsp_only\nUID=1004\nSSH=openssh\nSSH=dropbear\nEND=1\n');
    expect(inspection).toMatchObject({ firmware: 'unknown', ssh: 'mixed', wbm: 'unknown', serviceControl: 'unknown' });
    expect(() => parseManagementInspection(`BEGIN=1\n${'secret'.repeat(5000)}\nEND=1\n`)).toThrow('inspection_failed');
    expect(() => parseManagementInspection('BEGIN=1\nPASSWORD=secret\nEND=1\n')).toThrow('inspection_failed');
  });

  registerGatesDropbearEnrollmentByLiveVersionFirmwareAndNonRootIdentitySSSS(scope);

  registerDoesNotAttemptRootProcessExecutableReadsOrExecuteAnInstalledDaemonToInferItsVersion(scope);

  return scope;
}

export type ExecutableIsolatedManagementShellFixturesTestScope = ReturnType<
  typeof defineExecutableIsolatedManagementShellFixturesTests
>;
