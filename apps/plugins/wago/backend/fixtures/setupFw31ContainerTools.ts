import { symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { WAGO_DIN, WAGO_DOUT } from '../wago-hardware-deployment';

export function setupFw31ContainerTools({
  root,
  file: _file,
  executable,
  statStyle: _statStyle,
}: {
  root: string;
  file: (path: string, content: string, mode?: number) => void;
  executable: (path: string, source: string) => void;
  statStyle: 'native' | 'terse';
}) {
  // Advisory-lock behavior itself is covered by the stream fixture below.
  executable(
    'etc/init.d/runtime',
    `
const fs=require('node:fs'),root=process.env.FIXTURE_ROOT,a=process.argv.slice(2),f=process.env.FAULT;
// The actual FW31 script has no status case and exits zero without output.
if(a[0]==='status')process.exit(0);
if(a[0]!=='stop'||!['1','2'].includes(a[1]))process.exit(99);
fs.appendFileSync(root+'/vendor.log','runtime '+a.join(' ')+'\\n');
if(f==='codesys-stop-failed')process.exit(1);
if(f!=='codesys-stop-stuck'){fs.writeFileSync(root+'/plc','stopped');fs.rmSync(root+'/proc/77',{recursive:true,force:true});}`,
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
 fs.writeFileSync(p+'/comm','runtime\\n');
 fs.writeFileSync(p+'/status','Uid: 10001 10001 10001 10001\\nGid: 10001 10001 10001 10001\\nGroups: 10001\\n');
 fs.writeFileSync(p+'/stat',(c.pid||42)+' (runtime) S '+'0 '.repeat(18)+'1234\\n');
 fs.writeFileSync(p+'/cgroup','0::/docker/'+fullId(c)+'\\n');
 for(const n of ['uid_map','gid_map'])fs.writeFileSync(p+'/'+n,'0 0 4294967295\\n');
};
const save=()=>{const next=root+'/containers.json.'+process.pid;fs.writeFileSync(next,JSON.stringify(state));fs.renameSync(next,root+'/containers.json');state.forEach(syncProcess);},find=id=>state.find(c=>c.id===id||c.name===id||fullId(c)===id);
if(args[0]==='container'&&args[1]==='ls'){
 if(fault==='docker-list-failed')process.exit(1);
 const filter=args.indexOf('--filter'),selected=filter===-1?state:state.filter(c=>args[filter+1]==='name=^/'+c.name+'$');
  selected.forEach(c=>console.log((args.includes('--no-trunc')?fullId(c):fullId(c).slice(0,12))+(args.at(-1)==='{{.ID}}'?'':' '+c.name)));
}else if(args[0]==='inspect'){
  const c=find(args.at(-1));if(!c||fault==='docker-inspect-failed')process.exit(1);
  if(args[2]==='{{.Id}}'){console.log(fullId(c));process.exit(0);}
  if(args[2]==='{{.Image}}'){console.log(c.imageId);process.exit(0);}
  if(args[2]==='{{.Image}} {{.State.Running}}'){console.log(c.imageId+' '+String(c.running));process.exit(0);}
  if(args[2].includes('update-token')){console.log(c.updateToken||'');process.exit(0);}
 console.log(args[2].includes('.State.Pid')?fullId(c)+' '+(c.running?(c.pid||42):0)+' '+String(c.running)+' ':args[2]==='{{.Name}}'?'/'+c.name:args[2].includes('.Mounts')?(c.mounts||[]).join('\\n'):args[2].includes('.Privileged')?String(c.privileged===true):args[2].includes('.State.Running')&&args[2].includes('.RestartPolicy')?String(c.running)+' '+(c.restart||'no'):args[2].includes('.RestartPolicy')?(c.restart||'no'):String(c.running));
}else if(args[0]==='update'){
  const c=find(args.at(-1));if(!c||fault==='update-failed')process.exit(1);if(fault!=='update-stuck')c.restart='no';save();
}else if(args[0]==='rename'){
  const c=find(args[1]);if(!c||find(args[2]))process.exit(1);c.name=args[2];save();
}else if(args[0]==='stop'||args[0]==='start'){
 const c=find(args.at(-1));if(!c||fault==='stop-failed')process.exit(1);
 if(fault!=='stop-stuck'||args[0]!=='stop')c.running=args[0]==='start';
 if(!c.running)fs.rmSync(root+'/proc/'+(c.pid||42),{recursive:true,force:true});
 save();
}else if(args[0]==='rm'){
 if(fault==='remove')process.exit(1);
 const c=find(args.at(-1));if(!c)process.exit(1);if(fault!=='remove-stuck')state=state.filter(v=>v!==c);save();
}else if(args[0]==='load'){
  if(!args.includes('-i'))fs.readFileSync(0);
  console.log('Loaded image ID: '+(fs.existsSync(root+'/loaded-image-id')?fs.readFileSync(root+'/loaded-image-id','utf8'):'sha256:fixture'));if(fault==='load')process.exit(1);
}else if(args[0]==='image'&&args[1]==='inspect'){
  if(fault==='inspect-image')process.exit(1);
  if(args.includes('--format'))console.log(args[3]==='{{.Id}}'?fs.readFileSync(root+'/loaded-image-id','utf8'):(fs.existsSync(root+'/loaded-image-platform')?fs.readFileSync(root+'/loaded-image-platform','utf8'):'linux/arm/v7'));
}else if(args[0]==='run'){
 if(find('attraccess-wago')||!args.includes('--pull=never'))process.exit(1);
 if(args[args.indexOf('--user')+1]!=='10001:10001'||args[args.indexOf('--cap-drop')+1]!=='ALL'||args[args.indexOf('--security-opt')+1]!=='no-new-privileges'||args[args.indexOf('--network')+1]!=='host'||args[args.indexOf('--restart')+1]!=='no')process.exit(98);
 const mounts=['type=bind,src='+root+'${WAGO_DIN},dst=/run/attraccess-wago/io/din,readonly','type=bind,src='+root+'${WAGO_DOUT},dst=/run/attraccess-wago/io/dout'];
 if(!mounts.every(m=>args.includes(m)))process.exit(98);
 const data=args[args.indexOf('-v')+1].split(':')[0];
  if(fs.existsSync(data+'/credentials.json')&&!args.includes('--label'))process.exit(98);
 fs.writeFileSync(data+'/new-state','new enrollment state');
  state.push({id:'new-id',name:'attraccess-wago',running:fault!=='start',restart:'no',...(args.includes('--label')?{imageId:args.at(-1),updateToken:args[args.indexOf('--label')+1].split('=')[1]}:{}),mounts:[root+'${WAGO_DIN}',root+'${WAGO_DOUT}']});save();
 if(fault==='kill')process.kill(Number(process.env.FIXTURE_CALLER_PID||process.ppid),'SIGKILL');
 if(fault==='start')process.exit(1);
 console.log('new-id');
}else if(args[0]==='version'){console.log('25.0.4');}else process.exit(99);`,
  );
}
