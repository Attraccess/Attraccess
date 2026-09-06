import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { WAGO_DIN, WAGO_DOUT, wagoRuntimeBootScript } from '../wago-hardware-deployment';

export interface FixtureContainer {
  id: string;
  name: string;
  running: boolean;
  mounts?: string[];
  restart?: string;
  privileged?: boolean;
  pid?: number;
}

/** Isolated FW31 interfaces: runtime has start/stop (status is a no-op),
 * config_runtime selects 0 and removes S98, config_docker install is validation
 * of present firmware binaries and activate moves S99 and starts the daemon.
 * No host Docker, PLC process, privilege transition, or network can be reached.
 */
export function fw31ShellFixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'wago-fw31-shell-')));
  const file = (path: string, content: string, mode = 0o600) => {
    mkdirSync(dirname(join(root, path)), { recursive: true, mode: 0o700 });
    writeFileSync(join(root, path), content, { mode });
  };
  const read = (path: string) => readFileSync(join(root, path), 'utf8');
  const executable = (path: string, source: string) => file(path, `#!${process.execPath}\n${source}`, 0o700);
  mkdirSync(join(root, 'bin'));
  for (const [name, path] of Object.entries({
    sh: '/bin/sh',
    cat: '/bin/cat',
    cp: '/bin/cp',
    cmp: '/usr/bin/cmp',
    awk: '/usr/bin/awk',
    od: '/usr/bin/od',
    mkdir: '/bin/mkdir',
    mktemp: '/usr/bin/mktemp',
    mv: '/bin/mv',
    chmod: '/bin/chmod',
    rm: '/bin/rm',
    touch: '/usr/bin/touch',
    grep: '/usr/bin/grep',
    wc: '/usr/bin/wc',
    tr: '/usr/bin/tr',
    sed: '/usr/bin/sed',
    base64: '/usr/bin/base64',
  }))
    symlinkSync(path, join(root, 'bin', name));
  for (const path of ['tmp', 'var/lib', 'home', 'etc/attraccess-wago', 'etc/rc.d/disabled'])
    mkdirSync(join(root, path), { recursive: true, mode: 0o700 });
  file('etc/passwd', 'root:x:0:0:root:/root:/bin/sh\n');
  file('etc/group', 'root:x:0:\n');
  file('etc/nsswitch.conf', 'passwd: files\ngroup: files\n');
  file('proc/self/uid_map', '0 0 4294967295\n');
  file('proc/self/gid_map', '0 0 4294967295\n');
  file('proc/1/status', 'Uid:\t0\t0\t0\t0\nGid:\t0\t0\t0\t0\nGroups:\t0\n');
  file('proc/1/stat', '1 (init) S 0 ' + '0 '.repeat(17) + '1\n');
  file('proc/1/cgroup', '0::/\n');
  mkdirSync(join(root, 'proc/1/fd'));
  file('etc/os-release', 'PTXDIST_PLATFORM_NAME="cc100"\nVERSION_ID="2024.12.0"\nVERSION="4.9.1(31)"\n');
  file('etc/specific/rtsversion', '0');
  file(WAGO_DIN, '5', 0o400);
  file(WAGO_DOUT, '2', 0o600);
  file('daemon', 'running');
  file('plc', 'stopped');
  file('containers.json', '[]');
  file('owners.json', JSON.stringify({ [WAGO_DIN]: '10001:10001', [WAGO_DOUT]: '10001:10001' }));
  file('etc/rc.d/S99_zz_attraccess_wago', wagoRuntimeBootScript(root), 0o700);
  file('bin/dockerd', '#!/bin/sh\nexit 99\n', 0o700);
  executable(
    'bin/sleep',
    `const fs=require('node:fs'),root=process.env.FIXTURE_ROOT;if(fs.readdirSync(root+'/etc/attraccess-wago').some(n=>n.startsWith('supervisor-start.')))Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,20);`,
  );
  file('bin/sync', '#!/bin/sh\nexit 0\n', 0o700);
  file(
    'bin/nohup',
    `#!/bin/sh
set -eu
umask 077
printf '%s\\n' "$*" >> "$FIXTURE_ROOT/supervisor.log"
test "\${FAULT:-}" != supervisor-launch-failed || exit 1
config="$FIXTURE_ROOT/etc/attraccess-wago"
if test ! -e "$config/supervisor.lock"; then (set -C; : > "$config/supervisor.lock") || exit 1; fi
exec 8<>"$config/supervisor.lock"
flock -n 8 || exit 1
touch "$FIXTURE_ROOT/supervisor-fixture-live"
trap 'rm -f "$FIXTURE_ROOT/supervisor-fixture-live"' EXIT
# Even the synthetic gate acknowledgement has a live owner and real flock
# lifetime when the stream test replaces flock with the OS implementation.
while :; do
  pending=0
  for request in "$config"/supervisor-start.*; do
    test -d "$request" || continue
    pending=1
    if test ! -e "$request/ready"; then (set -C; printf '%s\\n' "$$" > "$request/ready") || :; fi
  done
  test "$pending" = 1 || exit 0
  sleep 2
done
`,
    0o700,
  );
  file(
    'bin/df',
    '#!/bin/sh\nif [ "$FAULT" = storage ]; then echo "disk 100 99 1"; else echo "disk 999999 0 999999"; fi\n',
    0o700,
  );
  file(
    'bin/tar',
    '#!/bin/sh\nif [ "$1" = --version ]; then echo "GNU tar fixture"; exit 0; fi\nshift 2\nexec /usr/bin/tar "$@"\n',
    0o700,
  );
  executable(
    'bin/readlink',
    `if(process.env.FAULT==='readlink-failed')process.exit(1);const fs=require('node:fs');console.log(process.argv.includes('-f')?fs.realpathSync(process.argv.at(-1)):fs.readlinkSync(process.argv.at(-1)));`,
  );
  executable(
    'bin/stat',
    `
const fs=require('node:fs'),root=process.env.FIXTURE_ROOT,args=process.argv.slice(2),p=args.at(-1);
if(p!==root&&!p.startsWith(root+'/'))process.exit(99);
const s=args[0].includes('L')?fs.statSync(p):fs.lstatSync(p),owners=JSON.parse(fs.readFileSync(root+'/owners.json','utf8'));
const owner=(owners[p.slice(root.length)]||'0:0').split(':'),mode=(s.mode&0o7777).toString(8);
const values={'%u':owner[0],'%g':owner[1],'%a':mode,'%h':s.nlink,'%d':s.dev,'%i':s.ino};
console.log(args[1].replace(/%[ugahdi]/g,v=>values[v]));`,
  );
  executable(
    'etc/config-tools/get_filesystem_data',
    `if(process.argv[2]!=='active-partition-medium')process.exit(99);console.log(process.env.FAULT==='sd-card'?'sd-card':'internal-flash');`,
  );
  executable(
    'bin/timeout',
    `
const args=process.argv.slice(2);
if(args[0]!=='-k'||args[1]!=='5'||!['10','30','45'].includes(args[2]))process.exit(99);
if(process.env.FAULT==='gate-timeout'&&args[3].endsWith('/S99_zz_attraccess_wago'))process.exit(124);
// Match the generated command's deadline. Shorter wall-clock caps measure host
// process scheduling under parallel Jest workers, not the modeled timeout.
const r=require('node:child_process').spawnSync(args[3],args.slice(4),{env:{...process.env,FIXTURE_CALLER_PID:String(process.ppid)},stdio:'inherit',timeout:Number(args[2])*1000});
process.exit(r.status ?? 124);`,
  );
  executable(
    'bin/ps',
    `
const fs=require('node:fs'),root=process.env.FIXTURE_ROOT,f=process.env.FAULT;
if(f==='ps-failed')process.exit(1);
if(fs.readFileSync(root+'/plc','utf8')==='running')console.log(f==='codesys2'?'plclinux_rt':'codesys3');
if(f==='docker-info-failed')console.log('dockerd');`,
  );
  executable(
    'bin/setpriv',
    `
const fs=require('node:fs'),root=process.env.FIXTURE_ROOT,args=process.argv.slice(2);
if(!['--reuid=10001','--regid=10001','--clear-groups','--bounding-set=-all','--inh-caps=-all','--ambient-caps=-all','--no-new-privs'].every((v,i)=>args[i]===v))process.exit(99);
if(process.env.FAULT==='setpriv-unsupported')process.exit(127);
if(args.at(-1).includes('id -u'))process.exit(0);
const owners=JSON.parse(fs.readFileSync(root+'/owners.json','utf8'));
for(const [i,path] of args.slice(-2).entries()){
 if(!path.startsWith(root+'/'))process.exit(99);
 const s=fs.statSync(path),needed=i===0?0o400:0o600;
 if(!s.isFile()||owners[path.slice(root.length)]!=='10001:10001'||(s.mode&needed)!==needed)process.exit(1);
}
process.exit(process.env.FAULT==='io-permissions'?1:0);`,
  );
  executable(
    'bin/chown',
    `
const fs=require('node:fs'),root=process.env.FIXTURE_ROOT,args=process.argv.slice(2);
if(process.env.FAULT==='chown-failed')process.exit(1);
const owners=JSON.parse(fs.readFileSync(root+'/owners.json','utf8'));
for(const p of args.slice(1)){if(!p.startsWith(root+'/'))process.exit(99);owners[p.slice(root.length)]=args[0];}
fs.writeFileSync(root+'/owners.json',JSON.stringify(owners));`,
  );
  // Advisory-lock behavior itself is covered by the stream fixture below.
  executable(
    'bin/flock',
    `
const fs=require('node:fs'),root=process.env.FIXTURE_ROOT;
if(process.argv[2]==='-u')process.exit(0);
if(process.argv[3]==='8'&&fs.existsSync(root+'/supervisor-fixture-live'))process.exit(1);
if(process.env.FAULT==='lock-handoff'){
 const path=root+'/flock-calls',calls=fs.existsSync(path)?Number(fs.readFileSync(path,'utf8')):0;
 fs.writeFileSync(path,String(calls+1));process.exit(calls===1?1:0);
}
process.exit(process.env.FAULT==='locked'?1:0);`,
  );
  executable(
    'bin/sha256sum',
    `
const fs=require('node:fs'),crypto=require('node:crypto');
const [digest,path]=fs.readFileSync(0,'utf8').trim().split(/\\s+/);
process.exit(crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex')===digest?0:1);`,
  );
  executable(
    'etc/init.d/runtime',
    `
const fs=require('node:fs'),root=process.env.FIXTURE_ROOT,a=process.argv.slice(2),f=process.env.FAULT;
// The actual FW31 script has no status case and exits zero without output.
if(a[0]==='status')process.exit(0);
if(a[0]!=='stop'||!['1','2'].includes(a[1]))process.exit(99);
fs.appendFileSync(root+'/vendor.log','runtime '+a.join(' ')+'\\n');
if(f==='codesys-stop-failed')process.exit(1);
if(f!=='codesys-stop-stuck')fs.writeFileSync(root+'/plc','stopped');`,
  );
  executable(
    'etc/config-tools/config_runtime',
    `
const fs=require('node:fs'),root=process.env.FIXTURE_ROOT,a=process.argv.slice(2),f=process.env.FAULT;
if(a.join(' ')!=='--wait runtime-version=0 force-new-version=yes restart-server=NO')process.exit(99);
fs.appendFileSync(root+'/vendor.log','config_runtime '+a.join(' ')+'\\n');
if(f==='codesys-disable-failed')process.exit(1);
if(fs.readFileSync(root+'/etc/specific/rtsversion','utf8')!=='0'){
 // Actual clear_runtime writes selection0 only when -f S98_runtime succeeds.
 // An absent or broken enabled link can therefore mask an incomplete disable.
 let enabled=false;try{enabled=fs.statSync(root+'/etc/rc.d/S98_runtime').isFile();}catch(e){if(e.code!=='ENOENT')throw e;}
 if(enabled){
  fs.writeFileSync(root+'/etc/specific/rtsversion','0');
  if(f!=='codesys-boot-stuck')fs.rmSync(root+'/etc/rc.d/S98_runtime',{force:true});
 }
}`,
  );
  executable(
    'etc/init.d/dockerd',
    `
const fs=require('node:fs'),root=process.env.FIXTURE_ROOT,a=process.argv[2];
if(!['start','stop','restart'].includes(a)){console.log('usage: start|stop|restart');process.exit(0);}
fs.appendFileSync(root+'/vendor.log','dockerd '+a+'\\n');
fs.writeFileSync(root+'/daemon',a==='stop'?'stopped':'running');`,
  );
  symlinkSync(join(root, 'etc/init.d/dockerd'), join(root, 'etc/rc.d/S99_docker'));
  executable(
    'etc/config-tools/get_docker_config',
    `
const fs=require('node:fs'),root=process.env.FIXTURE_ROOT,a=process.argv[2],running=fs.readFileSync(root+'/daemon','utf8')==='running';
if(process.env.DOCKER_HOST!=='unix:///var/run/docker.sock'||process.env.DOCKER_CONTEXT)process.exit(99);
if(a==='install-status')console.log(running||fs.existsSync(root+'/home/docker')?'installed':'not installed');
else if(a==='activation-status')console.log(running?'active':'inactive');else process.exit(99);`,
  );
  executable(
    'etc/config-tools/config_docker',
    `
const fs=require('node:fs'),cp=require('node:child_process'),root=process.env.FIXTURE_ROOT,a=process.argv[2],f=process.env.FAULT;
if(process.env.DOCKER_HOST!=='unix:///var/run/docker.sock'||process.env.DOCKER_CONTEXT)process.exit(99);
if(!['install','activate'].includes(a))process.exit(99);
fs.appendFileSync(root+'/vendor.log','config_docker '+a+'\\n');
if(f==='docker-'+a+'-failed')process.exit(1);
if(a==='install'){if(fs.readFileSync(root+'/daemon','utf8')==='running')process.exit(1);process.exit(0);}
if(fs.existsSync(root+'/etc/rc.d/disabled/S99_docker'))fs.renameSync(root+'/etc/rc.d/disabled/S99_docker',root+'/etc/rc.d/S99_docker');
if(f==='docker-activate-stuck')process.exit(0);
const r=cp.spawnSync(root+'/etc/init.d/dockerd',['start'],{env:process.env});process.exit(r.status ?? 1);`,
  );
  executable(
    'bin/docker',
    `
const fs=require('node:fs'),root=process.env.FIXTURE_ROOT,args=process.argv.slice(2),fault=process.env.FAULT;
if(args.shift()!=='--host'||args.shift()!=='unix:///var/run/docker.sock')process.exit(99);
fs.appendFileSync(root+'/docker.log',args.join(' ')+'\\n');
if(args[0]==='info'){
 if(fault==='docker-info-failed'||fs.readFileSync(root+'/daemon','utf8')!=='running')process.exit(1);
 console.log(args.includes('--format')&&args.at(-1).includes('SecurityOptions')?(fault==='userns-remap'?'["name=userns"]':'["name=seccomp,profile=builtin"]'):root+'/var/lib');process.exit(0);
}
if(fs.readFileSync(root+'/daemon','utf8')!=='running')process.exit(1);
let state=JSON.parse(fs.readFileSync(root+'/containers.json','utf8'));
const fullId=c=>Buffer.from(c.id).toString('hex').padEnd(64,'0').slice(0,64);
const syncProcess=c=>{
 if(c.name!=='attraccess-wago')return;
 const p=root+'/proc/'+(c.pid||42);
 if(!c.running){fs.rmSync(p,{recursive:true,force:true});return;}
 fs.mkdirSync(p+'/fd',{recursive:true});
 fs.writeFileSync(p+'/status','Uid: 10001 10001 10001 10001\\nGid: 10001 10001 10001 10001\\nGroups: 10001\\n');
 fs.writeFileSync(p+'/stat',(c.pid||42)+' (runtime) S '+'0 '.repeat(18)+'1234\\n');
 fs.writeFileSync(p+'/cgroup','0::/docker/'+fullId(c)+'\\n');
 for(const n of ['uid_map','gid_map'])fs.writeFileSync(p+'/'+n,'0 0 4294967295\\n');
};
const save=()=>{fs.writeFileSync(root+'/containers.json',JSON.stringify(state));state.forEach(syncProcess);},find=id=>state.find(c=>c.id===id||c.name===id||fullId(c)===id);
if(args[0]==='container'&&args[1]==='ls'){
 if(fault==='docker-list-failed')process.exit(1);
 const filter=args.indexOf('--filter'),selected=filter===-1?state:state.filter(c=>args[filter+1]==='name=^/'+c.name+'$');
 selected.forEach(c=>console.log(args.at(-1)==='{{.ID}}'?(filter===-1?c.id:fullId(c)):c.id+' '+c.name));
}else if(args[0]==='inspect'){
 const c=find(args.at(-1));if(!c||fault==='docker-inspect-failed')process.exit(1);
 console.log(args[2].includes('.State.Pid')?fullId(c)+' '+(c.running?(c.pid||42):0)+' '+String(c.running)+' ':args[2]==='{{.Name}}'?'/'+c.name:args[2].includes('.Mounts')?(c.mounts||[]).join('\\n'):args[2].includes('.Privileged')?String(c.privileged===true):args[2].includes('.State.Running')&&args[2].includes('.RestartPolicy')?String(c.running)+' '+(c.restart||'no'):args[2].includes('.RestartPolicy')?(c.restart||'no'):String(c.running));
}else if(args[0]==='update'){
 const c=find(args.at(-1));if(!c||fault==='update-failed')process.exit(1);if(fault!=='update-stuck')c.restart='no';save();
}else if(args[0]==='stop'||args[0]==='start'){
 const c=find(args.at(-1));if(!c||fault==='stop-failed')process.exit(1);
 if(fault!=='stop-stuck'||args[0]!=='stop')c.running=args[0]==='start';
 if(!c.running)fs.rmSync(root+'/proc/'+(c.pid||42),{recursive:true,force:true});
 save();
}else if(args[0]==='rm'){
 if(fault==='remove')process.exit(1);
 const c=find(args.at(-1));if(!c)process.exit(1);if(fault!=='remove-stuck')state=state.filter(v=>v!==c);save();
}else if(args[0]==='load'){
 console.log('Loaded image ID: sha256:fixture');if(fault==='load')process.exit(1);
}else if(args[0]==='image'&&args[1]==='inspect'){
 if(fault==='inspect-image')process.exit(1);
}else if(args[0]==='run'){
 if(find('attraccess-wago')||!args.includes('--pull=never'))process.exit(1);
 if(args[args.indexOf('--user')+1]!=='10001:10001'||args[args.indexOf('--cap-drop')+1]!=='ALL'||args[args.indexOf('--security-opt')+1]!=='no-new-privileges'||args[args.indexOf('--network')+1]!=='host'||args[args.indexOf('--restart')+1]!=='no')process.exit(98);
 const mounts=['type=bind,src='+root+'${WAGO_DIN},dst=/run/attraccess-wago/io/din,readonly','type=bind,src='+root+'${WAGO_DOUT},dst=/run/attraccess-wago/io/dout'];
 if(!mounts.every(m=>args.includes(m)))process.exit(98);
 const data=args[args.indexOf('-v')+1].split(':')[0];
 if(fs.existsSync(data+'/credentials.json'))process.exit(98);
 fs.writeFileSync(data+'/new-state','new enrollment state');
 state.push({id:'new-id',name:'attraccess-wago',running:fault!=='start',restart:'no',mounts:[root+'${WAGO_DIN}',root+'${WAGO_DOUT}']});save();
 if(fault==='kill')process.kill(Number(process.env.FIXTURE_CALLER_PID||process.ppid),'SIGKILL');
 if(fault==='start')process.exit(1);
 console.log('new-id');
}else if(args[0]==='version'){console.log('25.0.4');}else process.exit(99);`,
  );
  return {
    root,
    file,
    read,
    containers: () => JSON.parse(read('containers.json')) as FixtureContainer[],
    setContainers: (containers: FixtureContainer[]) => {
      file('containers.json', JSON.stringify(containers));
      for (const container of containers) {
        if (container.name !== 'attraccess-wago' || !container.running) continue;
        const path = `proc/${container.pid || 42}`;
        file(path + '/status', 'Uid: 10001 10001 10001 10001\nGid: 10001 10001 10001 10001\nGroups: 10001\n');
        file(path + '/stat', `${container.pid || 42} (runtime) S ` + '0 '.repeat(18) + '1234\n');
        file(
          path + '/cgroup',
          `0::/docker/${Buffer.from(container.id).toString('hex').padEnd(64, '0').slice(0, 64)}\n`,
        );
        file(path + '/uid_map', '0 0 4294967295\n');
        file(path + '/gid_map', '0 0 4294967295\n');
        mkdirSync(join(root, path, 'fd'), { recursive: true });
      }
    },
    run: (script: string, fault = '', input?: Buffer, timeout = 60000) =>
      spawnSync('/bin/sh', ['-c', `${script}\nstatus=$?\nexit "$status"`], {
        input,
        encoding: 'utf8',
        timeout,
        env: { PATH: join(root, 'bin'), FIXTURE_ROOT: root, TMPDIR: join(root, 'tmp'), FAULT: fault },
      }),
    dispose: () => rmSync(root, { recursive: true, force: true }),
  };
}
