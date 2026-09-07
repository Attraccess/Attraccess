import { mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { fw31ShellFixture } from './fixtures/fw31-shell-fixture';
import { parseWagoCodesysClassification, wagoCodesysClassificationShell } from './wago-codesys-classification';
import {
  WAGO_DOUT,
  parseWagoHardwareDeploymentReport,
  wagoCommissioningPreparationScript,
  wagoHardwareDeploymentReportScript,
  wagoRuntimeBootScript,
} from './wago-hardware-deployment';

describe('source-only CODESYS classification', () => {
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
  it('observes only candidates with 180 unrelated processes', () => {
    fixture.file(
      'ps-output',
      '1 init\n88 pp_codesys3\n' + Array.from({ length: 180 }, (_, i) => `${i + 100} worker\n`).join(''),
    );
    // No /proc entries exist for these unrelated PIDs; observing any would fail.
    expect(classify()).toBe('inactive');
    expect(fixture.read('ps-scans')).toBe('4');
  });
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
    if (runtime) processFixture(1768, 'codesys3');
    fixture.file('ps-output', rows + (runtime ? ' 1768 codesys3\n' : ''));
    expect(classify()).toBe(runtime ? 'active' : 'inactive');
    expect(fixture.read('ps-scans')).toBe('4');
  });
  it('accepts a printable native row at the 4096-byte boundary', () => {
    fixture.file('ps-output', '1 init\n88 pp_codesys3\n99 ' + 'w'.repeat(4093) + '\n');
    expect(classify()).toBe('inactive');
  });
  it.each(['CoDeSyS', 'plclinux_rt', 'rtswrapper'])('does not ignore a long comm ending in %s', (match) => {
    const comm = 'w'.repeat(4093 - match.length) + match;
    processFixture(99, comm);
    fixture.file('ps-output', '1 init\n88 pp_codesys3\n99 ' + comm + '\n');
    // Full-name matching finds the candidate; its nonstandard /proc comm fails closed.
    expect(classify()).toBe('unknown');
  });
  it.each([2, 3, 4])('ignores unrelated PID churn at scan %s', (scan) => {
    processFixture(99, 'worker');
    fixture.file(
      'bin/ps',
      fixture.read('bin/ps').replace(
        'fs.writeFileSync(counter,String(n));',
        `fs.writeFileSync(counter,String(n));
if(n===${scan}){
 fs.rmSync(root+'/proc/99',{recursive:true});
 fs.mkdirSync(root+'/proc/100');fs.writeFileSync(root+'/proc/100/comm','another-worker\\n');
}`,
      ),
    );
    expect(classify()).toBe('inactive');
  });
  it.each([2, 3, 4])('rejects candidate appearance/removal/exec/start/comm changes at scan %s', (scan) => {
    processFixture(99, 'codesys3');
    fixture.file(
      'bin/ps',
      fixture.read('bin/ps').replace(
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
      fixture.file('ps-scans', '0');
      expect(classify(fault)).toBe('unknown');
      rmSync(join(fixture.root, 'proc/100'), { recursive: true, force: true });
      processFixture(99, 'codesys3');
    }
  });
  it('ignores native enumeration ordering', () => {
    processFixture(99, 'codesys3');
    fixture.file(
      'bin/ps',
      fixture
        .read('bin/ps')
        .replace('.sort((a,b)=>Number(a)-Number(b))', '.sort((a,b)=>n%2?Number(a)-Number(b):Number(b)-Number(a))'),
    );
    expect(classify()).toBe('active');
  });
  it.each(['worker', 'codesys3'])('handles %s disappearing after ps emits its row', (comm) => {
    processFixture(99, comm);
    fixture.file(
      'bin/ps',
      fixture
        .read('bin/ps')
        .replace('process.exit(0);\n}', "fs.rmSync(root+'/proc/99',{recursive:true,force:true});process.exit(0);\n}"),
    );
    expect(classify()).toBe(comm === 'worker' ? 'inactive' : 'unknown');
  });
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
    fixture.file('ps-output', output);
    expect(classify()).toBe('unknown');
  });
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
  it('keeps both vendor stops and permanent disablement with the provider still present', () => {
    const result = fixture.run(wagoCommissioningPreparationScript('a'.repeat(32), fixture.root));
    expect(result.status).toBe(0);
    expect(fixture.read('vendor.log')).toContain(
      'runtime stop 1\nruntime stop 2\nconfig_runtime --wait runtime-version=0 force-new-version=yes restart-server=NO\n',
    );
    expect(fixture.read('proc/88/comm')).toBe('pp_codesys3\n');
    expect(classify()).toBe('inactive');
  });
  it.each(['codesys3', 'plclinux_rt', 'rtswrapper', 'XCoDeSyS-other', 'pp_codesys4'])(
    'does not hide another matching process: %s',
    (comm) => {
      processFixture(99, comm);
      expect(classify()).toBe('active');
    },
  );
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
  ])('fails closed on %s', (fault) => expect(classify(fault)).toBe('unknown'));
  it.each(['Uid', 'Gid'])('requires all four %s fields to be zero', (field) => {
    for (let index = 0; index < 4; index++) {
      const values = ['0', '0', '0', '0'];
      values[index] = '1';
      fixture.file('proc/88/status', `${field}: ${values.join(' ')}\n${field === 'Uid' ? 'Gid' : 'Uid'}: 0 0 0 0\n`);
      expect(classify()).toBe('unknown');
    }
  });
  it.each([
    'Uid: 0 0 0\nGid: 0 0 0 0\n',
    'Uid: 0 0 0 0\nUid: 0 0 0 0\nGid: 0 0 0 0\n',
    'Uid: 0 0 0 0\nGid: 0 0 0\n',
    'Uid: 0 0 0 0\nGid: 0 0 0 0\nGid: 0 0 0 0\n',
    'Uid: 0 0 0 0\n',
    'Gid: 0 0 0 0\n',
    'Uid: 0 0\0 0 0\nGid: 0 0 0 0\n',
  ])('rejects malformed status %j', (status) => {
    fixture.file('proc/88/status', status);
    expect(classify()).toBe('unknown');
  });
  it.each(['comm', 'stat', 'status', 'exe'])('rejects unreadable/missing %s', (field) => {
    rmSync(join(fixture.root, 'proc/88', field));
    expect(classify()).toBe('unknown');
  });
  it.each([
    '88 (pp_codesys3) S ' + '0 '.repeat(18) + '1234\n',
    '88 (pp_codesys3) ? ' + '0 '.repeat(18) + '1234' + ' 0'.repeat(30) + '\n',
    '88 (pp_codesys3) S ' + '0 '.repeat(18) + '1234' + ' 0'.repeat(30),
  ])('rejects malformed stat %j', (stat) => {
    fixture.file('proc/88/stat', stat);
    expect(classify()).toBe('unknown');
  });
  it('does not infer inactivity from incomplete enumeration', () => {
    mkdirSync(join(fixture.root, 'proc/99'));
    expect(classify()).toBe('unknown');
  });
  it.each(['final-scan-failed', 'final-exec-change'])('fails closed during the closing scan: %s', (fault) => {
    rmSync(join(fixture.root, 'bin/cat'));
    fixture.file(
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
    expect(classify(fault)).toBe('unknown');
  });
  it('does not exempt the provider on an unverified profile', () => {
    fixture.file('etc/REVISIONS', 'FIRMWARE=unknown\n');
    expect(classify()).toBe('unknown');
  });
  it.each([false, true])('still blocks a provider holding writable DOUT (alias=%s)', (alias) => {
    const target = join(fixture.root, WAGO_DOUT);
    if (alias) symlinkSync(target, join(fixture.root, 'dout-alias'));
    symlinkSync(alias ? join(fixture.root, 'dout-alias') : target, join(fixture.root, 'proc/88/fd/3'));
    fixture.file('proc/88/fdinfo/3', 'flags:\t0100002\n');
    expect(classify()).toBe('inactive');
    const report = fixture.run(wagoHardwareDeploymentReportScript(fixture.root));
    expect(report.status).toBe(0);
    expect(parseWagoHardwareDeploymentReport(report.stdout).exclusivity).toBe('unknown');
  });
  it('still blocks enabled boot runtime with only the verified provider', () => {
    fixture.file('etc/specific/rtsversion', '2');
    fixture.file('etc/attraccess-wago/runtime-enabled', '');
    const report = fixture.run(wagoHardwareDeploymentReportScript(fixture.root));
    expect(report.status).toBe(0);
    expect(parseWagoHardwareDeploymentReport(report.stdout).exclusivity).toBe('codesys-boot-enabled');
    const boot = fixture.run('set -- start-checked\n' + wagoRuntimeBootScript(fixture.root));
    expect(boot.status).not.toBe(0);
    expect(boot.stderr).toContain('codesys-boot-enabled');
  });
  it.each(['pp_codesys3\n\n', 'pp_codesys3', 'pp_codesys3\0\n'])('rejects malformed comm framing %j', (comm) => {
    fixture.file('proc/88/comm', comm);
    expect(classify()).toBe('unknown');
  });
  it.each(['', '\n', 'inactive', 'inactive\nextra\n', 'inactive\ninactive\n', 'pp_codesys3\n', 'rtswrapper\n'])(
    'inspection rejects malformed classification %j',
    (output) => expect(parseWagoCodesysClassification(output)).toBe('unknown'),
  );
});
