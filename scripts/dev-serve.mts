// Dev-server launcher that auto-resolves ports and spawns nx serve
// FEATURE: dev-server-port-isolation

import { spawn } from 'node:child_process';
import { writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { findFreePort, isPortFree } from './lib/find-free-port.mts';

type Target = 'api' | 'frontend' | 'both';

interface Resolved {
  apiPort?: number;
  frontendPort?: number;
  previewPort?: number;
}

const PORTS_FILE = join(process.cwd(), '.dev-serve-ports.json');

function url(port: number): string {
  return `http://localhost:${port}`;
}

function writePortsFile(r: Resolved): void {
  const payload = {
    pid: process.pid,
    api: r.apiPort !== undefined ? { port: r.apiPort, url: url(r.apiPort) } : undefined,
    frontend: r.frontendPort !== undefined ? { port: r.frontendPort, url: url(r.frontendPort) } : undefined,
    preview: r.previewPort !== undefined ? { port: r.previewPort, url: url(r.previewPort) } : undefined,
  };
  writeFileSync(PORTS_FILE, `${JSON.stringify(payload, null, 2)}\n`);
}

function removePortsFile(): void {
  rmSync(PORTS_FILE, { force: true });
}

function parseArgs(argv: string[]): { only: Target; passthroughArgs: string[] } {
  let only: Target = 'both';
  const passthroughArgs: string[] = [];
  const args = argv.slice(2);
  let sawDelimiter = false;
  for (const arg of args) {
    if (sawDelimiter) {
      passthroughArgs.push(arg);
      continue;
    }
    if (arg === '--') {
      sawDelimiter = true;
      continue;
    }
    const m = arg.match(/^--only=(.+)$/);
    if (m) {
      if (m[1] === 'api' || m[1] === 'frontend' || m[1] === 'both') {
        only = m[1] as Target;
      } else {
        throw new Error(`Invalid value for --only: "${m[1]}". Must be api, frontend, or both.`);
      }
    } else if (arg === '--only') {
      throw new Error('--only requires a value: api|frontend|both');
    } else {
      passthroughArgs.push(arg);
    }
  }
  return { only, passthroughArgs };
}

async function resolvePort(envName: string, defaultStart: number, label: string): Promise<number> {
  const explicit = process.env[envName];
  if (explicit !== undefined && explicit !== '') {
    const port = Number(explicit);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error(`${envName}="${explicit}" is not a valid port`);
    }
    if (!(await isPortFree(port))) {
      throw new Error(`${label} port ${port} (from ${envName}) is already in use. Free it or unset ${envName}.`);
    }
    return port;
  }
  return findFreePort(defaultStart, 100);
}

function banner(r: Resolved): string {
  const lines: string[] = [];
  lines.push('┌─────────────────────────────────────────────┐');
  lines.push('│ Attraccess dev servers                      │');
  if (r.apiPort !== undefined) lines.push(`│   API      → http://localhost:${String(r.apiPort).padEnd(14)}│`);
  if (r.frontendPort !== undefined) lines.push(`│   Frontend → http://localhost:${String(r.frontendPort).padEnd(14)}│`);
  if (r.previewPort !== undefined) lines.push(`│   Preview  → http://localhost:${String(r.previewPort).padEnd(14)}│`);
  lines.push('└─────────────────────────────────────────────┘');
  return lines.join('\n');
}

async function main() {
  const { only, passthroughArgs } = parseArgs(process.argv);
  const resolved: Resolved = {};
  const childEnv: NodeJS.ProcessEnv = { ...process.env };

  if (only === 'api' || only === 'both') {
    resolved.apiPort = await resolvePort('PORT', 3000, 'API');
    childEnv.PORT = String(resolved.apiPort);
  }
  if (only === 'frontend' || only === 'both') {
    resolved.frontendPort = await resolvePort('VITE_PORT', 4200, 'Frontend');
    resolved.previewPort = await resolvePort('VITE_PREVIEW_PORT', 4300, 'Preview');
    childEnv.VITE_PORT = String(resolved.frontendPort);
    childEnv.VITE_PREVIEW_PORT = String(resolved.previewPort);
    if (resolved.apiPort !== undefined) {
      childEnv.VITE_API_PROXY_TARGET = `http://localhost:${resolved.apiPort}`;
    }
  }

  console.log(banner(resolved));
  writePortsFile(resolved);
  process.on('exit', removePortsFile);

  const projects = only === 'both' ? 'api,frontend' : only;
  const child = spawn(
    'pnpm',
    ['nx', 'run-many', '-t', 'serve', `--projects=${projects}`, '--outputStyle=stream', ...passthroughArgs],
    { stdio: 'inherit', env: childEnv },
  );

  const forward = (sig: NodeJS.Signals) => {
    if (!child.killed) child.kill(sig);
  };
  process.on('SIGINT', () => forward('SIGINT'));
  process.on('SIGTERM', () => forward('SIGTERM'));

  child.on('exit', (code, signal) => {
    if (signal) {
      removePortsFile();
      process.removeAllListeners('SIGINT');
      process.removeAllListeners('SIGTERM');
      process.kill(process.pid, signal);
    } else {
      process.exit(code ?? 0);
    }
  });
}

main().catch((err) => {
  console.error(`[dev-serve] ${err.message}`);
  process.exit(1);
});
