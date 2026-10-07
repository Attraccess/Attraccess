import type { SourceOnlyCodesysClassificationTestScope } from './wago-codesys-classification.spec';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { wagoCommissioningPreparationScript } from './wago-hardware-deployment';

export function registerAcceptsNativeLongKernelRowsWithAQualifiedProviderRuntimeS(
  scope: SourceOnlyCodesysClassificationTestScope,
): void {
  it.each([false, true])('accepts native long kernel rows with a qualified provider (runtime=%s)', (runtime) => {
    // Names from the owner PS_LONG_COMM capture; unrelated PIDs deliberately have no /proc fixture.
    const rows =
      '    1 init\n' +
      '    3 pool_workqueue_release\n' +
      '   14 rcu_tasks_rude_kthread\n' +
      '   50 irq/44-58000000.dma-controller\n' +
      '   91 irq/65-mmci-pl18x (cmd)\n' +
      '10589 kworker/0:2-events_power_efficient\n' +
      '   88 pp_codesys3\n';
    if (runtime) scope.processFixture(1768, 'codesys3');
    scope.fixture.file('ps-output', rows + (runtime ? ' 1768 codesys3\n' : ''));
    expect(scope.classify()).toBe(runtime ? 'active' : 'inactive');
    expect(scope.fixture.read('ps-scans')).toBe('4');
  });
}

export function registerDoesNotHideAnotherMatchingProcessS(scope: SourceOnlyCodesysClassificationTestScope): void {
  it.each(['codesys3', 'plclinux_rt', 'rtswrapper', 'XCoDeSyS-other', 'pp_codesys4'])(
    'does not hide another matching process: %s',
    (comm) => {
      scope.processFixture(99, comm);
      expect(scope.classify()).toBe('active');
    },
  );
}

export function registerDoesNotIgnoreALongCommEndingInS(scope: SourceOnlyCodesysClassificationTestScope): void {
  it.each(['CoDeSyS', 'plclinux_rt', 'rtswrapper'])('does not ignore a long comm ending in %s', (match) => {
    const comm = 'w'.repeat(4093 - match.length) + match;
    scope.processFixture(99, comm);
    scope.fixture.file('ps-output', '1 init\n88 pp_codesys3\n99 ' + comm + '\n');
    // Full-name matching finds the candidate; its nonstandard /proc comm fails closed.
    expect(scope.classify()).toBe('unknown');
  });
}

export function registerFailsClosedDuringTheClosingScanS(scope: SourceOnlyCodesysClassificationTestScope): void {
  it.each(['final-scan-failed', 'final-exec-change'])('fails closed during the closing scan: %s', (fault) => {
    rmSync(join(scope.fixture.root, 'bin/cat'));
    scope.fixture.file(
      'bin/cat',
      `#!${process.execPath}
const fs=require('node:fs'),root=process.env.FIXTURE_ROOT,p=process.argv[2];
if(!p.startsWith(root+'/'))process.exit(99);
if(p===root+'/proc/88/stat'){
 const counter=root+'/scan-count',n=fs.existsSync(counter)?Number(fs.readFileSync(counter))+1:1;
 fs.writeFileSync(counter,String(n));
 if(n===4){
  if(process.env.FAULT==='final-scan-failed')process.exit(1);
  fs.unlinkSync(root+'/proc/88/exe');fs.writeFileSync(root+'/proc/88/exe','new executable');
 }
}
process.stdout.write(fs.readFileSync(p));
`,
      0o700,
    );
    expect(scope.classify(fault)).toBe('unknown');
  });
}

export function registerFailsClosedOnS(scope: SourceOnlyCodesysClassificationTestScope): void {
  it.each([
    'wrong-path',
    'deleted-exe',
    'unreadable-exe',
    'wrong-hash',
    'hash-unreadable',
    'pid-reuse',
    'exec-change',
    'comm-change',
    'uid-change',
    'gid-change',
    'duplicate-ending-status',
  ])('fails closed on %s', (fault) => expect(scope.classify(fault)).toBe('unknown'));
}

export function registerHandlesSDisappearingAfterPsEmitsItsRow(scope: SourceOnlyCodesysClassificationTestScope): void {
  it.each(['worker', 'codesys3'])('handles %s disappearing after ps emits its row', (comm) => {
    scope.processFixture(99, comm);
    scope.fixture.file(
      'bin/ps',
      scope.fixture
        .read('bin/ps')
        .replace('process.exit(0);\n}', "fs.rmSync(root+'/proc/99',{recursive:true,force:true});process.exit(0);\n}"),
    );
    expect(scope.classify()).toBe(comm === 'worker' ? 'inactive' : 'unknown');
  });
}

export function registerIgnoresNativeEnumerationOrdering(scope: SourceOnlyCodesysClassificationTestScope): void {
  it('ignores native enumeration ordering', () => {
    scope.processFixture(99, 'codesys3');
    scope.fixture.file(
      'bin/ps',
      scope.fixture
        .read('bin/ps')
        .replace('.sort((a,b)=>Number(a)-Number(b))', '.sort((a,b)=>n%2?Number(a)-Number(b):Number(b)-Number(a))'),
    );
    expect(scope.classify()).toBe('active');
  });
}

export function registerIgnoresUnrelatedPidChurnAtScanS(scope: SourceOnlyCodesysClassificationTestScope): void {
  it.each([2, 3, 4])('ignores unrelated PID churn at scan %s', (scan) => {
    scope.processFixture(99, 'worker');
    scope.fixture.file(
      'bin/ps',
      scope.fixture.read('bin/ps').replace(
        'fs.writeFileSync(counter,String(n));',
        `fs.writeFileSync(counter,String(n));
if(n===${scan}){
 fs.rmSync(root+'/proc/99',{recursive:true});
 fs.mkdirSync(root+'/proc/100');fs.writeFileSync(root+'/proc/100/comm','another-worker\\n');
}`,
      ),
    );
    expect(scope.classify()).toBe('inactive');
  });
}

export function registerKeepsBothVendorStopsAndPermanentDisablementWithTheProviderStillPresent(
  scope: SourceOnlyCodesysClassificationTestScope,
): void {
  it('keeps both vendor stops and permanent disablement with the provider still present', () => {
    const result = scope.fixture.run(wagoCommissioningPreparationScript('a'.repeat(32), scope.fixture.root));
    expect(result.status).toBe(0);
    expect(scope.fixture.read('vendor.log')).toContain(
      'runtime stop 1\nruntime stop 2\nconfig_runtime --wait runtime-version=0 force-new-version=yes restart-server=NO\n',
    );
    expect(scope.fixture.read('proc/88/comm')).toBe('pp_codesys3\n');
    expect(scope.classify()).toBe('inactive');
  });
}

export function registerObservesOnlyCandidatesWith180UnrelatedProcesses(
  scope: SourceOnlyCodesysClassificationTestScope,
): void {
  it('observes only candidates with 180 unrelated processes', () => {
    scope.fixture.file(
      'ps-output',
      '1 init\n88 pp_codesys3\n' + Array.from({ length: 180 }, (_, i) => `${i + 100} worker\n`).join(''),
    );
    // No /proc entries exist for these unrelated PIDs; observing any would fail.
    expect(scope.classify()).toBe('inactive');
    expect(scope.fixture.read('ps-scans')).toBe('4');
  });
}

export function registerRejectsCandidateAppearanceRemovalExecStartCommChangesAtScanS(
  scope: SourceOnlyCodesysClassificationTestScope,
): void {
  it.each([2, 3, 4])('rejects candidate appearance/removal/exec/start/comm changes at scan %s', (scan) => {
    scope.processFixture(99, 'codesys3');
    scope.fixture.file(
      'bin/ps',
      scope.fixture.read('bin/ps').replace(
        'fs.writeFileSync(counter,String(n));',
        `fs.writeFileSync(counter,String(n));
if(n===${scan}){
 if(f==='candidate-appearance'){
  fs.cpSync(root+'/proc/99',root+'/proc/100',{recursive:true});
  fs.writeFileSync(root+'/proc/100/stat',fs.readFileSync(root+'/proc/99/stat','utf8').replace(/^99 /,'100 '));
 }
 if(f==='candidate-removal')fs.rmSync(root+'/proc/99',{recursive:true});
 if(f==='candidate-exec-swap'){
  fs.renameSync(root+'/proc/99/exe',root+'/old-exe');fs.writeFileSync(root+'/proc/99/exe','replacement');
 }
 if(f==='candidate-start-change')fs.writeFileSync(root+'/proc/99/stat',fs.readFileSync(root+'/proc/99/stat','utf8').replace('1234','5678'));
 if(f==='candidate-comm-change')fs.writeFileSync(root+'/proc/99/comm','rtswrapper\\n');
}`,
      ),
    );
    // Each fault gets its own scan counter and restores the original candidate.
    for (const fault of [
      'candidate-appearance',
      'candidate-removal',
      'candidate-exec-swap',
      'candidate-start-change',
      'candidate-comm-change',
    ]) {
      scope.fixture.file('ps-scans', '0');
      expect(scope.classify(fault)).toBe('unknown');
      rmSync(join(scope.fixture.root, 'proc/100'), { recursive: true, force: true });
      scope.processFixture(99, 'codesys3');
    }
  });
}

export function registerRejectsMalformedOrOutOfBoundsPsOutputCase(
  scope: SourceOnlyCodesysClassificationTestScope,
): void {
  it.each([
    '',
    '1 init',
    'PID COMMAND\n1 init\n',
    '1 init\n\n',
    '1 init\n99 worker\n99 worker\n',
    '1 init\n0 worker\n',
    '1 init\n2147483648 worker\n',
    '1 init\n99\n',
    '1 init\n99   \n',
    '1 init\n99 worker\0\n',
    '1 init\n99 worker\r\n',
    '1 init\n99 ' + 'w'.repeat(4094) + '\n',
    '1 init\n' + ' '.repeat(4090) + '99 worker\n',
    '1 init\n99 ' + 'w'.repeat(100) + '\tworker\n',
    '88 pp_codesys3\n',
    '1 init\n' + Array.from({ length: 4096 }, (_, i) => `${i + 2} worker\n`).join(''),
    '1 init\n' + Array.from({ length: 129 }, (_, i) => `${i + 2} codesys3\n`).join(''),
    '1 init\n' + Array.from({ length: 34 }, (_, i) => `${i + 2} ${'w'.repeat(4000)}\n`).join(''),
  ])('rejects malformed or out-of-bounds ps output (case %#)', (output) => {
    scope.fixture.file('ps-output', output);
    expect(scope.classify()).toBe('unknown');
  });
}

export function registerRejectsMalformedStatJ(scope: SourceOnlyCodesysClassificationTestScope): void {
  it.each([
    '88 (pp_codesys3) S ' + '0 '.repeat(18) + '1234\n',
    '88 (pp_codesys3) ? ' + '0 '.repeat(18) + '1234' + ' 0'.repeat(30) + '\n',
    '88 (pp_codesys3) S ' + '0 '.repeat(18) + '1234' + ' 0'.repeat(30),
  ])('rejects malformed stat %j', (stat) => {
    scope.fixture.file('proc/88/stat', stat);
    expect(scope.classify()).toBe('unknown');
  });
}

export function registerRejectsMalformedStatusJ(scope: SourceOnlyCodesysClassificationTestScope): void {
  it.each([
    'Uid: 0 0 0\nGid: 0 0 0 0\n',
    'Uid: 0 0 0 0\nUid: 0 0 0 0\nGid: 0 0 0 0\n',
    'Uid: 0 0 0 0\nGid: 0 0 0\n',
    'Uid: 0 0 0 0\nGid: 0 0 0 0\nGid: 0 0 0 0\n',
    'Uid: 0 0 0 0\n',
    'Gid: 0 0 0 0\n',
    'Uid: 0 0\0 0 0\nGid: 0 0 0 0\n',
  ])('rejects malformed status %j', (status) => {
    scope.fixture.file('proc/88/status', status);
    expect(scope.classify()).toBe('unknown');
  });
}

export function registerRequiresAllFourSFieldsToBeZero(scope: SourceOnlyCodesysClassificationTestScope): void {
  it.each(['Uid', 'Gid'])('requires all four %s fields to be zero', (field) => {
    for (let index = 0; index < 4; index++) {
      const values = ['0', '0', '0', '0'];
      values[index] = '1';
      scope.fixture.file(
        'proc/88/status',
        `${field}: ${values.join(' ')}\n${field === 'Uid' ? 'Gid' : 'Uid'}: 0 0 0 0\n`,
      );
      expect(scope.classify()).toBe('unknown');
    }
  });
}
