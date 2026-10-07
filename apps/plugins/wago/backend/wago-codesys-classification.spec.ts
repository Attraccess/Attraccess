import { mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { fw31ShellFixture } from './fixtures/fw31-shell-fixture';
import { parseWagoCodesysClassification, wagoCodesysClassificationShell } from './wago-codesys-classification';
import { parseWagoHardwareDeploymentReport, wagoHardwareDeploymentReportScript } from './wago-hardware-deployment';
import { registerObservesOnlyCandidatesWith180UnrelatedProcesses } from './wago-codesys-classification.accepts-native-long-kernel-rows-with-a-qualified-provider-runtime-s.test-cases';
import { registerAcceptsNativeLongKernelRowsWithAQualifiedProviderRuntimeS } from './wago-codesys-classification.accepts-native-long-kernel-rows-with-a-qualified-provider-runtime-s.test-cases';
import { registerDoesNotIgnoreALongCommEndingInS } from './wago-codesys-classification.accepts-native-long-kernel-rows-with-a-qualified-provider-runtime-s.test-cases';
import { registerIgnoresUnrelatedPidChurnAtScanS } from './wago-codesys-classification.accepts-native-long-kernel-rows-with-a-qualified-provider-runtime-s.test-cases';
import { registerRejectsCandidateAppearanceRemovalExecStartCommChangesAtScanS } from './wago-codesys-classification.accepts-native-long-kernel-rows-with-a-qualified-provider-runtime-s.test-cases';
import { registerIgnoresNativeEnumerationOrdering } from './wago-codesys-classification.accepts-native-long-kernel-rows-with-a-qualified-provider-runtime-s.test-cases';
import { registerHandlesSDisappearingAfterPsEmitsItsRow } from './wago-codesys-classification.accepts-native-long-kernel-rows-with-a-qualified-provider-runtime-s.test-cases';
import { registerRejectsMalformedOrOutOfBoundsPsOutputCase } from './wago-codesys-classification.accepts-native-long-kernel-rows-with-a-qualified-provider-runtime-s.test-cases';
import { registerKeepsBothVendorStopsAndPermanentDisablementWithTheProviderStillPresent } from './wago-codesys-classification.accepts-native-long-kernel-rows-with-a-qualified-provider-runtime-s.test-cases';
import { registerDoesNotHideAnotherMatchingProcessS } from './wago-codesys-classification.accepts-native-long-kernel-rows-with-a-qualified-provider-runtime-s.test-cases';
import { registerFailsClosedOnS } from './wago-codesys-classification.accepts-native-long-kernel-rows-with-a-qualified-provider-runtime-s.test-cases';
import { registerRequiresAllFourSFieldsToBeZero } from './wago-codesys-classification.accepts-native-long-kernel-rows-with-a-qualified-provider-runtime-s.test-cases';
import { registerRejectsMalformedStatusJ } from './wago-codesys-classification.accepts-native-long-kernel-rows-with-a-qualified-provider-runtime-s.test-cases';
import { registerRejectsMalformedStatJ } from './wago-codesys-classification.accepts-native-long-kernel-rows-with-a-qualified-provider-runtime-s.test-cases';
import { registerFailsClosedDuringTheClosingScanS } from './wago-codesys-classification.accepts-native-long-kernel-rows-with-a-qualified-provider-runtime-s.test-cases';
import { registerStillBlocksAProviderHoldingWritableDoutAliasS } from './wago-codesys-classification.still-blocks-a-provider-holding-writable-dout-alias-s.test-cases';
import { registerStillBlocksEnabledBootRuntimeWithOnlyTheVerifiedProvider } from './wago-codesys-classification.still-blocks-a-provider-holding-writable-dout-alias-s.test-cases';

describe('source-only CODESYS classification', () => {
  defineSourceOnlyCodesysClassificationTests();
});

export function defineSourceOnlyCodesysClassificationTests() {
  let fixture: ReturnType<typeof fw31ShellFixture>;
  const processFixture = (pid: number, comm: string) => {
    fixture.file(`proc/${pid}/comm`, `${comm}\n`);
    fixture.file(`proc/${pid}/stat`, `${pid} (${comm}) S ` + '0 '.repeat(18) + '1234' + ' 0'.repeat(30) + '\n');
    fixture.file(`proc/${pid}/status`, 'Uid: 0 0 0 0\nGid: 0 0 0 0\nGroups: 0\n');
    if (comm !== 'pp_codesys3') fixture.file(`proc/${pid}/exe`, 'synthetic runtime executable');
    mkdirSync(join(fixture.root, `proc/${pid}/fd`), { recursive: true });
  };
  const classify = (fault = '') => {
    const result = fixture.run(
      `root='${fixture.root}'\n${wagoCodesysClassificationShell()}\nwago_codesys_classify`,
      fault,
    );
    expect(result.status).toBe(0);
    return parseWagoCodesysClassification(result.stdout);
  };
  beforeEach(() => {
    fixture = fw31ShellFixture();
    processFixture(88, 'pp_codesys3');
    fixture.file('usr/sbin/pp_codesys3', 'synthetic provider bytes, not a vendor binary');
    symlinkSync(join(fixture.root, 'usr/sbin/pp_codesys3'), join(fixture.root, 'proc/88/exe'));
    // Model pinned observations, never read a host executable or controller.
    fixture.file(
      'bin/readlink',
      `#!${process.execPath}
const fs=require('node:fs'),p=process.argv.at(-1),f=process.env.FAULT;
if(p.endsWith('/proc/88/exe')){
 if(f==='unreadable-exe')process.exit(1);
 console.log(f==='wrong-path'?'/tmp/pp_codesys3':f==='deleted-exe'?'/usr/sbin/pp_codesys3 (deleted)':'/usr/sbin/pp_codesys3');
}else console.log(process.argv.includes('-f')?fs.realpathSync(p):fs.readlinkSync(p));
`,
      0o700,
    );
    fixture.file(
      'bin/sha256sum',
      `#!${process.execPath}
const fs=require('node:fs'),root=process.env.FIXTURE_ROOT,f=process.env.FAULT;
fs.readFileSync(0);
if(f==='hash-unreadable')process.exit(1);
if(f==='pid-reuse')fs.writeFileSync(root+'/proc/88/stat','88 (pp_codesys3) S '+'0 '.repeat(18)+'5678'+' 0'.repeat(30)+'\\n');
if(f==='exec-change'){fs.unlinkSync(root+'/proc/88/exe');fs.writeFileSync(root+'/proc/88/exe','replacement');}
if(f==='comm-change')fs.writeFileSync(root+'/proc/88/comm','codesys3\\n');
if(f==='volatile-status')fs.writeFileSync(root+'/proc/88/status','State: R (running)\\nUid: 0 0 0 0\\nGid: 0 0 0 0\\nGroups: 0\\nVmRSS: 1024 kB\\nvoluntary_ctxt_switches: 42\\n');
if(f==='uid-change'||f==='gid-change')fs.writeFileSync(root+'/proc/88/status',f==='uid-change'?'Uid: 0 0 0 1\\nGid: 0 0 0 0\\n':'Uid: 0 0 0 0\\nGid: 0 0 0 1\\n');
if(f==='duplicate-ending-status')fs.appendFileSync(root+'/proc/88/status','Gid: 0 0 0 0\\n');
console.log(f==='wrong-hash'?'0'.repeat(64)+'  -':'f37752c01173911379286db7f4ae0f9ab5d6327c63d49c7a07b2ba37de9bd6bf  -');
`,
      0o700,
    );
  });
  afterEach(() => fixture.dispose());

  it('ignores volatile provider status fields', () => {
    expect(classify('volatile-status')).toBe('inactive');
  });
  it('does not read unrelated process identity files', () => {
    processFixture(99, 'unrelated');
    rmSync(join(fixture.root, 'bin/cat'));
    fixture.file('bin/cat', '#!/bin/sh\ncase "$1" in */proc/99/*) exit 1 ;; esac\nexec /bin/cat "$@"\n', 0o700);
    expect(classify()).toBe('inactive');
  });
  const scope = {
    get fixture() {
      return fixture;
    },
    set fixture(value: typeof fixture) {
      fixture = value;
    },
    get classify() {
      return classify;
    },
    get processFixture() {
      return processFixture;
    },
  };
  registerObservesOnlyCandidatesWith180UnrelatedProcesses(scope);
  registerAcceptsNativeLongKernelRowsWithAQualifiedProviderRuntimeS(scope);
  it('accepts a printable native row at the 4096-byte boundary', () => {
    fixture.file('ps-output', '1 init\n88 pp_codesys3\n99 ' + 'w'.repeat(4093) + '\n');
    expect(classify()).toBe('inactive');
  });
  registerDoesNotIgnoreALongCommEndingInS(scope);
  registerIgnoresUnrelatedPidChurnAtScanS(scope);
  registerRejectsCandidateAppearanceRemovalExecStartCommChangesAtScanS(scope);
  registerIgnoresNativeEnumerationOrdering(scope);
  registerHandlesSDisappearingAfterPsEmitsItsRow(scope);
  it('rejects disagreement between native ps and candidate comm', () => {
    fixture.file('ps-output', '1 init\n88 codesys3\n');
    expect(classify()).toBe('unknown');
  });
  it('fails closed when native ps times out', () => {
    fixture.file('bin/timeout', '#!/bin/sh\nexit 124\n');
    expect(classify()).toBe('unknown');
  });
  it.each(['ps-failed', 'ps-partial-failed'])('does not accept a failed ps producer: %s', (fault) => {
    // Even an empty candidate set must have a complete successful producer.
    rmSync(join(fixture.root, 'proc/88'), { recursive: true });
    expect(classify(fault)).toBe('unknown');
  });
  registerRejectsMalformedOrOutOfBoundsPsOutputCase(scope);
  it('accepts complete native enumeration without candidates', () => {
    rmSync(join(fixture.root, 'proc/88'), { recursive: true });
    expect(classify()).toBe('inactive');
  });
  it('classifies the exact verified provider alone as non-runtime in the shared enum and hardware report', () => {
    expect(classify()).toBe('inactive');
    const result = fixture.run(wagoHardwareDeploymentReportScript(fixture.root));
    expect(result.status).toBe(0);
    expect(parseWagoHardwareDeploymentReport(result.stdout).exclusivity).toBe('clear');
  });
  registerKeepsBothVendorStopsAndPermanentDisablementWithTheProviderStillPresent(scope);
  registerDoesNotHideAnotherMatchingProcessS(scope);
  registerFailsClosedOnS(scope);
  registerRequiresAllFourSFieldsToBeZero(scope);
  registerRejectsMalformedStatusJ(scope);
  it.each(['comm', 'stat', 'status', 'exe'])('rejects unreadable/missing %s', (field) => {
    rmSync(join(fixture.root, 'proc/88', field));
    expect(classify()).toBe('unknown');
  });
  registerRejectsMalformedStatJ(scope);
  it('does not infer inactivity from incomplete enumeration', () => {
    mkdirSync(join(fixture.root, 'proc/99'));
    expect(classify()).toBe('unknown');
  });
  registerFailsClosedDuringTheClosingScanS(scope);
  it('does not exempt the provider on an unverified profile', () => {
    fixture.file('etc/REVISIONS', 'FIRMWARE=unknown\n');
    expect(classify()).toBe('unknown');
  });
  registerStillBlocksAProviderHoldingWritableDoutAliasS(scope);
  registerStillBlocksEnabledBootRuntimeWithOnlyTheVerifiedProvider(scope);
  it.each(['pp_codesys3\n\n', 'pp_codesys3', 'pp_codesys3\0\n'])('rejects malformed comm framing %j', (comm) => {
    fixture.file('proc/88/comm', comm);
    expect(classify()).toBe('unknown');
  });
  it.each(['', '\n', 'inactive', 'inactive\nextra\n', 'inactive\ninactive\n', 'pp_codesys3\n', 'rtswrapper\n'])(
    'inspection rejects malformed classification %j',
    (output) => expect(parseWagoCodesysClassification(output)).toBe('unknown'),
  );

  return scope;
}

export type SourceOnlyCodesysClassificationTestScope = ReturnType<typeof defineSourceOnlyCodesysClassificationTests>;
