import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { setupFw31OperatingSystem } from './setupFw31OperatingSystem';
import { setupFw31PrivilegeTools } from './setupFw31PrivilegeTools';
import { setupFw31ContainerTools } from './setupFw31ContainerTools';

export interface FixtureContainer {
  id: string;
  name: string;
  running: boolean;
  mounts?: string[];
  restart?: string;
  privileged?: boolean;
  pid?: number;
  imageId?: string;
  updateToken?: string;
}

/** Isolated FW31 interfaces: runtime has start/stop (status is a no-op),
 * config_runtime selects 0 and removes S98, config_docker install is validation
 * of present firmware binaries and activate moves S99 and starts the daemon.
 * No host Docker, PLC process, privilege transition, or network can be reached.
 */
export function fw31ShellFixture(statStyle: 'native' | 'terse' = 'native') {
  const root = realpathSync(mkdtempSync(join(process.cwd(), '.wago-fw31-shell-')));
  const file = (path: string, content: string, mode = 0o600) => {
    mkdirSync(dirname(join(root, path)), { recursive: true, mode: 0o700 });
    writeFileSync(join(root, path), content, { mode });
    if (path === 'plc') {
      const plc = join(root, 'proc/77');
      if (content === 'running') {
        mkdirSync(join(plc, 'fd'), { recursive: true });
        writeFileSync(join(plc, 'comm'), 'codesys3\n');
        writeFileSync(join(plc, 'stat'), '77 (codesys3) S ' + '0 '.repeat(18) + '77' + ' 0'.repeat(30) + '\n');
        writeFileSync(join(plc, 'exe'), 'synthetic runtime executable');
      } else rmSync(plc, { recursive: true, force: true });
    }
  };
  const read = (path: string) => readFileSync(join(root, path), 'utf8');
  const executable = (path: string, source: string) => file(path, `#!${process.execPath}\n${source}`, 0o700);
  setupFw31OperatingSystem({ root, file, executable, statStyle });
  setupFw31PrivilegeTools({ root, file, executable, statStyle });
  // Advisory-lock behavior itself is covered by the stream fixture below.
  setupFw31ContainerTools({ root, file, executable, statStyle });
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
        file(path + '/comm', 'runtime\n');
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
    // Loaded runners spawn every fixture shim through node; a tight spawn timeout
    // turns contention into spurious SIGTERM results instead of catching real hangs.
    run: (script: string, fault = '', input?: Buffer, timeout = 240000) => {
      if (fault === 'codesys2' && read('plc') === 'running') file('proc/77/comm', 'plclinux_rt\n');
      const path = join(root, 'tmp', `run-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.sh`);
      writeFileSync(path, `${script}\nstatus=$?\nexit "$status"`, { mode: 0o700 });
      try {
        return spawnSync('/bin/sh', [path], {
          input,
          encoding: 'utf8',
          timeout,
          env: { PATH: join(root, 'bin'), FIXTURE_ROOT: root, TMPDIR: join(root, 'tmp'), FAULT: fault },
        });
      } finally {
        rmSync(path, { force: true });
      }
    },
    // ponytail: a just-exited shim's child (node) process can still hold the
    // directory open for a moment after spawnSync returns; retry through that race
    // instead of widening the fixture's process bookkeeping.
    dispose: () => rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }),
  };
}
