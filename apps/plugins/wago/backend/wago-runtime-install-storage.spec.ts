import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { fw31ShellFixture } from './fixtures/fw31-shell-fixture';
import {
  runtimeBundleCapacityPreflightScript,
  runtimeBundlePreflightScript,
  runtimeBundleStagingCapacityPreflightScript,
} from './wago-runtime-install';
import { registerBudgetsOneUpdateArchiveAndDockerReserveOnlyOnTheirActualFilesystems } from './wago-runtime-install-storage.test-cases';
import { registerChecksUnpreparedStagingWithInactiveDockerWithoutQueryingOrActivatingIt } from './wago-runtime-install-storage.test-cases';
import { registerRejectsInsufficientEarlyStagingAtPathIndexSWithInactiveDocker } from './wago-runtime-install-storage.test-cases';
import { registerRechecksDockerAdmissionAndSharedStagingCapacityAfterActivation } from './wago-runtime-install-storage.test-cases';
import { registerRequiresStagingToolsEarlyButNeitherADockerBinaryNorDaemonInfo } from './wago-runtime-install-storage.test-cases';
import { registerUsesTheDiscoveredDockerRootRatherThanAssumingHome } from './wago-runtime-install-storage.test-cases';
import { registerBudgetsTwoMoveCopiesOnEqualDeviceBindMounts } from './wago-runtime-install-storage.test-cases';
import { registerAdmitsTheReportedRootHomeCapacitiesWithoutNeedingPreparedIoOrInactiveCodesys } from './wago-runtime-install-storage.test-cases';
import { registerRejectsInsufficientSCapacity } from './wago-runtime-install-storage.test-cases';
import { registerEnforcesEachFilesystemPeakForDevicesJ } from './wago-runtime-install-storage.enforces-each-filesystem-peak-for-devices-j.test-cases';
import { registerFailsClosedForInvalidDfOutputJ } from './wago-runtime-install-storage.test-cases';
import { registerDoesNotMaskAFailingDfWithOtherwiseValidOutput } from './wago-runtime-install-storage.test-cases';
import { registerFailsClosedOnUnknownFilesystemIdentityMissingToolsAndUnavailableDocker } from './wago-runtime-install-storage.test-cases';
import { registerUsesValidatedNativeDeviceInodePairsWhenAvailable } from './wago-runtime-install-storage.test-cases';
import { registerRejectsMalformedNativeIdentityJInBothStandaloneChecks } from './wago-runtime-install-storage.test-cases';
import { registerRejectsInvalidByteSizeS } from './wago-runtime-install-storage.test-cases';

describe('read-only runtime capacity preflight (isolated commands only)', () => {
  defineReadOnlyRuntimeCapacityPreflightIsolatedCommandsOnlyTests();
});

export function defineReadOnlyRuntimeCapacityPreflightIsolatedCommandsOnlyTests() {
  let fixture: ReturnType<typeof fw31ShellFixture>;
  const mib = 1024 * 1024;
  // Include outer headers/manifest/padding instead of equating inner and outer sizes.
  const bytes = 81 * mib + 10240;
  const b = Math.ceil(bytes / 1024);
  const reserve = 16384;
  const dfHeader = 'Filesystem 1024-blocks Used Available Capacity Mounted on\n';
  const run = () => fixture.run(runtimeBundleCapacityPreflightScript(bytes, fixture.root));
  const runStaging = () => fixture.run(runtimeBundleStagingCapacityPreflightScript(bytes, fixture.root));
  const layout = (devices: number[], free: number[]) => {
    fixture.file('storage.json', JSON.stringify({ devices, free }));
  };
  beforeEach(() => {
    fixture = fw31ShellFixture();
    layout([1, 1, 1, 2], [181 * 1024, 181 * 1024, 181 * 1024, 848 * 1024]);
    const prelude = `#!${process.execPath}
const fs=require('node:fs'), root=process.env.FIXTURE_ROOT, args=process.argv.slice(2);
const statPath=args.at(-1);
if(args[0]==='--help'){console.log('BusyBox v1.37.0 () multi-call binary.\\nUsage: stat [-ltf] FILE...');process.exit(0);}
// The capability probe observes only the isolated root, not a capacity path.
if(args[0]==='-t'&&(statPath==='/'||statPath===root)){
 const s=fs.lstatSync(root,{bigint:true});
 console.log(statPath+' '+[s.size,s.blocks,s.mode.toString(16),s.uid,s.gid,s.dev.toString(16),s.ino,s.nlink,0,0,1,1,1,s.blksize].join(' '));process.exit(0);
}
const paths=['/etc/attraccess-wago','/tmp','/var/lib',fs.existsSync(root+'/docker-root')?fs.readFileSync(root+'/docker-root','utf8').slice(root.length):'/home'];
if(args.at(-1)===root+'/etc')args[args.length-1]=root+'/etc/attraccess-wago';
const i=paths.indexOf(args.at(-1).slice(root.length));
if(!args.at(-1).startsWith(root+'/')||i<0)process.exit(99);
const storage=JSON.parse(fs.readFileSync(root+'/storage.json','utf8'));
`;
    fixture.file(
      'bin/stat',
      prelude +
        `if(args[0]!=='-Lt')process.exit(1);console.log(statPath+' 4096 8 41c0 0 0 '+storage.devices[i].toString(16)+' 123 2 0 0 1 1 1 4096');`,
      0o700,
    );
    fixture.file(
      'bin/df',
      prelude +
        `if(args[0]!=='-Pk')process.exit(99);console.log(${JSON.stringify(dfHeader)}+'fixture 9999999 0 '+storage.free[i]+' 0% /fixture');`,
      0o700,
    );
    fixture.file(
      'bin/docker',
      `#!${process.execPath}
const args=process.argv.slice(2);
if(args.join(' ')!=='--host unix:///var/run/docker.sock info --format {{.DockerRootDir}}')process.exit(99);
const fs=require('node:fs'),root=process.env.FIXTURE_ROOT;
fs.appendFileSync(root+'/docker.log','info\\n');
if(fs.readFileSync(root+'/daemon','utf8')!=='running')process.exit(1);
console.log(fs.existsSync(root+'/docker-root')?fs.readFileSync(root+'/docker-root','utf8'):root+'/home');
`,
      0o700,
    );
  });
  const scope = {
    get layout() {
      return layout;
    },
    get b() {
      return b;
    },
    get reserve() {
      return reserve;
    },
    get fixture() {
      return fixture;
    },
    set fixture(value: typeof fixture) {
      fixture = value;
    },
    get bytes() {
      return bytes;
    },
    get runStaging() {
      return runStaging;
    },
    get run() {
      return run;
    },
    get dfHeader() {
      return dfHeader;
    },
    get mib() {
      return mib;
    },
  };
  afterEach(() => fixture.dispose());

  registerBudgetsOneUpdateArchiveAndDockerReserveOnlyOnTheirActualFilesystems(scope);

  registerChecksUnpreparedStagingWithInactiveDockerWithoutQueryingOrActivatingIt(scope);

  registerRejectsInsufficientEarlyStagingAtPathIndexSWithInactiveDocker(scope);

  registerRechecksDockerAdmissionAndSharedStagingCapacityAfterActivation(scope);

  registerRequiresStagingToolsEarlyButNeitherADockerBinaryNorDaemonInfo(scope);

  registerUsesTheDiscoveredDockerRootRatherThanAssumingHome(scope);

  it.each(['', 'relative', '/missing-directory'])('rejects invalid or missing Docker root %j', (root) => {
    fixture.file('docker-root', root.startsWith('/') ? fixture.root + root : root);
    expect(run().status).not.toBe(0);
  });

  registerBudgetsTwoMoveCopiesOnEqualDeviceBindMounts(scope);

  registerAdmitsTheReportedRootHomeCapacitiesWithoutNeedingPreparedIoOrInactiveCodesys(scope);

  registerRejectsInsufficientSCapacity(scope);

  // All partitions of E,T,V,D (full) and E,T,V (staging). Coefficients are
  // independent expected phase peaks, indexed by device rather than path.
  registerEnforcesEachFilesystemPeakForDevicesJ(scope);

  registerFailsClosedForInvalidDfOutputJ(scope);

  registerDoesNotMaskAFailingDfWithOtherwiseValidOutput(scope);

  registerFailsClosedOnUnknownFilesystemIdentityMissingToolsAndUnavailableDocker(scope);

  it('retains the hardware check in the delivery preflight', () => {
    const script = runtimeBundlePreflightScript(bytes, fixture.root);
    expect(script).toContain(runtimeBundleCapacityPreflightScript(bytes, fixture.root));
    expect(script).toContain('codesys-active');
    expect(script).toContain('uid10001-access-denied');
  });

  registerUsesValidatedNativeDeviceInodePairsWhenAvailable(scope);

  registerRejectsMalformedNativeIdentityJInBothStandaloneChecks(scope);

  it('requires the stat capture tool before checking capacity', () => {
    rmSync(join(fixture.root, 'bin/dd'));
    expect(runStaging().stderr).toContain('Runtime tool unavailable: dd');
    expect(run().stderr).toContain('Runtime tool unavailable: dd');
  });

  registerRejectsInvalidByteSizeS(scope);

  return scope;
}

export type ReadOnlyRuntimeCapacityPreflightIsolatedCommandsOnlyTestScope = ReturnType<
  typeof defineReadOnlyRuntimeCapacityPreflightIsolatedCommandsOnlyTests
>;
