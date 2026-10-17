export function setupFw31PrivilegeTools({
  root: _root,
  file,
  executable,
  statStyle: _statStyle,
}: {
  root: string;
  file: (path: string, content: string, mode?: number) => void;
  executable: (path: string, source: string) => void;
  statStyle: 'native' | 'terse';
}) {
  executable(
    'bin/timeout',
    `
const args=process.argv.slice(2);
if(args[0]!=='-k'||args[1]!=='5'||!['10','30','45','300','310'].includes(args[2]))process.exit(99);
if(process.env.FAULT==='gate-timeout'&&args[3].endsWith('/S99_zz_attraccess_wago'))process.exit(124);
if(process.env.FAULT==='lock-wait-expired'&&args[3]==='flock')process.exit(124);
const root=process.env.FIXTURE_ROOT;
// Model image-import duration without a minute-long sleep in each shell test.
const fs=require('node:fs'),loadDuration=root+'/docker-load-seconds';
if(args[3]==='docker'&&args[6]==='load'&&fs.existsSync(loadDuration)&&Number(fs.readFileSync(loadDuration,'utf8'))>Number(args[2]))process.exit(143);
const privilegeLifecycle=['privilege-deadline','privilege-delayed'].includes(process.env.FAULT)&&['setpriv','capsh'].some(tool=>args[3]===root+'/bin/'+tool)&&args[4]!=='--help';
// Match the generated command's deadline. Shorter wall-clock caps measure host
// process scheduling, except for the explicit isolated privilege lifecycle test.
const installerStall=args[3]==='dd'&&(process.env.FAULT==='installer-stalled'||(process.env.FAULT==='installer-eof-stalled'&&args.includes('count=1')));
// timeout preserves inherited flock descriptors on FW31. Node's default stdio
// would close them before the child and incorrectly report lock contention.
const stdio=['inherit','inherit','inherit','ignore','ignore','ignore','ignore','ignore'];
for(const fd of [8,9]){try{stdio[fd]=fs.fstatSync(fd).isFile()?fd:'ignore';}catch{stdio[fd]='ignore';}}
const r=require('node:child_process').spawnSync(args[3],args.slice(4),{env:{...process.env,FIXTURE_CALLER_PID:String(process.ppid)},stdio,timeout:installerStall?200:privilegeLifecycle?1000:Number(args[2])*1000});
if(privilegeLifecycle)require('node:fs').appendFileSync(root+'/privilege-lifecycle.log',JSON.stringify({event:'reaped',tool:args[3].split('/').at(-1),pid:r.pid,status:r.status,error:r.error?.code})+'\\n');
process.exit(r.status ?? 124);`,
  );

  executable(
    'bin/ps',
    `
const fs=require('node:fs'),root=process.env.FIXTURE_ROOT,f=process.env.FAULT;
if(f==='ps-failed')process.exit(1);
if(process.argv.slice(2).join(' ')==='-eo pid=,comm='){
 const counter=root+'/ps-scans',n=fs.existsSync(counter)?Number(fs.readFileSync(counter))+1:1;
 fs.writeFileSync(counter,String(n));
 if(f==='ps-partial-failed'){console.log('1 init');process.exit(1);}
 if(fs.existsSync(root+'/ps-output')){process.stdout.write(fs.readFileSync(root+'/ps-output'));process.exit(0);}
 for(const pid of fs.readdirSync(root+'/proc').filter(p=>/^[1-9][0-9]*$/.test(p)).sort((a,b)=>Number(a)-Number(b))){
  console.log(pid+' '+fs.readFileSync(root+'/proc/'+pid+'/comm','utf8').replace(/\\n$/,''));
 }
 process.exit(0);
}
if(fs.readFileSync(root+'/plc','utf8')==='running')console.log(f==='codesys2'?'plclinux_rt':'codesys3');
if(f==='docker-info-failed')console.log('dockerd');`,
  );

  file(
    'privilege-status',
    'Uid: 10001 10001 10001 10001\nGid: 10001 10001 10001 10001\nGroups:\nCapInh: 0000000000000000\nCapPrm: 0000000000000000\nCapEff: 0000000000000000\nCapBnd: 0000000000000000\nCapAmb: 0000000000000000\nNoNewPrivs: 1\n',
  );

  for (const tool of ['setpriv', 'capsh'])
    executable(
      'bin/' + tool,
      `
const fs=require('node:fs'),root=process.env.FIXTURE_ROOT,args=process.argv.slice(2);
const tool=${JSON.stringify(tool)},fault=process.env.FAULT;
const expected=tool==='setpriv'?['--reuid=10001','--regid=10001','--clear-groups','--bounding-set=-all','--inh-caps=-all','--ambient-caps=-all','--no-new-privs','/bin/sh','-c']:['--drop=all','--groups=','--gid=10001','--uid=10001','--caps=','--noamb','--no-new-privs','--shell=/bin/sh','--','-c'];
if(process.env.FAULT==='privilege-tools-unavailable')process.exit(127);
if(args[0]==='--help'){
 console.log(tool==='setpriv'&&fault==='busybox-setpriv'?'--no-new-privs --inh-caps --ambient-caps':expected.join(' '));process.exit(0);
}
if(tool==='setpriv'&&fault==='busybox-setpriv')process.exit(99);
if(args.length!==expected.length+1||!expected.every((v,i)=>args[i]===v))process.exit(99);
fs.appendFileSync(root+'/privilege.log',JSON.stringify([tool,...args.slice(0,-1)])+'\\n');
if(fault==='privilege-timeout')process.exit(124);
if(fault==='privilege-transitions-failed'||(tool==='setpriv'&&fault==='setpriv-transition-failed'))process.exit(1);
if(['privilege-deadline','privilege-delayed'].includes(fault)){
 const marker=root+'/privilege-live-'+tool;
 const record=(event,status)=>fs.appendFileSync(root+'/privilege-lifecycle.log',JSON.stringify({event,tool,pid:process.pid,status})+'\\n');
 process.on('exit',status=>{fs.rmSync(marker,{force:true});record('exit',status);});
 process.on('SIGTERM',()=>process.exit(124));
 fs.writeFileSync(marker,String(process.pid));record('started');
 // Deliberately no child processes: this branch models only transition lifetime.
 setTimeout(()=>{if(fault==='privilege-delayed'){process.stdout.write('accessible');process.exit(0);}process.exit(99);},fault==='privilege-delayed'?150:5000);
 return;
}
const owners=JSON.parse(fs.readFileSync(root+'/owners.json','utf8'));
let permitted=fault!=='io-permissions';
for(const [i,path] of [process.env.din,process.env.dout].entries()){
 if(!path.startsWith(root+'/'))process.exit(99);
 const s=fs.statSync(path),needed=i===0?0o400:0o600;
 if(!s.isFile()||owners[path.slice(root.length)]!=='10001:10001'||(s.mode&needed)!==needed)permitted=false;
}
// Execute the production verifier, substituting ONLY mock proc state and access
// predicates. Never invoke a host privilege tool or read the host process state.
const statusPath=fs.existsSync(root+'/privilege-status-'+tool)?root+'/privilege-status-'+tool:root+'/privilege-status';
const script=args.at(-1).replace('/proc/$$/status',JSON.stringify(statusPath));
const mock='test() { case "$1" in -r|-w) printf "%s\\\\n" "$*" >> "$FIXTURE_ROOT/permission-tests.log"; if command test "$1" = -w && command test "\${FAULT:-}" = io-write-denied; then return 1; fi; return '+(permitted?'0':'1')+' ;; *) command test "$@" ;; esac; }\\n';
const r=require('node:child_process').spawnSync('/bin/sh',['-c',mock+script],{env:process.env,stdio:'inherit',timeout:5000});
process.exit(r.status ?? 124);`,
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
// Actual FW31 BusyBox flock supports [-sxun], but no -w timeout option.
if(process.argv.includes('-w')){console.error("flock: invalid option -- 'w'");process.exit(1);}
if(process.argv[2]==='-u')process.exit(0);
if(process.env.FAULT==='supervisor-lock-held'){
  if(process.argv[2]==='-n')process.exit(1);
  if(process.argv[2]==='9')require('node:child_process').spawnSync('/bin/sleep',['0.1']);
}
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
const args=process.argv.slice(2),file=args.find(arg=>!arg.startsWith('-'));
if(file){console.log(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')+'  '+file);process.exit(0);}
const [digest,path]=fs.readFileSync(0,'utf8').trim().split(/\\s+/);
process.exit(crypto.createHash('sha256').update(fs.readFileSync(path)).digest('hex')===digest?0:1);`,
  );
}
