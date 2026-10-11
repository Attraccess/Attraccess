// Dev-server launcher that auto-resolves ports and spawns nx serve
// FEATURE: dev-server-port-isolation

import { spawn } from 'node:child_process';
import { writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { findFreePort, isPortFree } from './lib/find-free-port.mts';

type Target = 'api' | 'frontend' | 'both';

interface LaunchOptions {
  only: Target;
  tui: boolean;
  kiosk: boolean;
  attractap: boolean;
  passthroughArgs: string[];
}

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

export function parseArgs(argv: string[]): LaunchOptions {
  let only: Target = 'both';
  let tui = false;
  let kiosk = false;
  let attractap = false;
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
    if (arg === '--tui') {
      tui = true;
      continue;
    }
    if (arg === '--with-kiosk' || arg === '--with-companion') {
      kiosk = true;
      continue;
    }
    if (arg === '--with-attractap') {
      attractap = true;
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
  if (only === 'frontend' && (kiosk || attractap)) {
    throw new Error('Asset build flags require the API. Use --only=api or omit --only=frontend.');
  }
  return { only, tui, kiosk, attractap, passthroughArgs };
}

export async function resolvePort(envName: string, defaultStart: number, label: string): Promise<number> {
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

export async function main() {
  const { only, tui, kiosk, attractap, passthroughArgs } = parseArgs(process.argv);
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
  // Default: streamed output (agent/CI friendly). --tui: nx interactive terminal UI.
  const outputArgs = tui ? ['--tui'] : ['--outputStyle=stream'];
  if (tui) {
    // nx auto-detects the TUI from the terminal, but that detection fails when
    // nx runs as a grandchild process (here: pnpm → node launcher → nx) even
    // with an inherited TTY, so it silently downgrades to streamed output.
    // NX_TUI=true forces it on. The terminal is still a real TTY, so it renders.
    childEnv.NX_TUI = 'true';
  }
  let child: ReturnType<typeof spawn> | undefined;
  const forward = (sig: NodeJS.Signals) => {
    if (child && !child.killed) child.kill(sig);
  };
  process.on('SIGINT', () => forward('SIGINT'));
  process.on('SIGTERM', () => forward('SIGTERM'));

  const assetTarget =
    kiosk && attractap
      ? 'prepare-all-assets'
      : kiosk
        ? 'prepare-kiosk-assets'
        : attractap
          ? 'prepare-attractap-assets'
          : undefined;
  if (assetTarget) {
    const preparation = spawn('pnpm', ['nx', 'run-many', '-t', assetTarget, '--projects=api', ...outputArgs], {
      stdio: 'inherit',
      env: childEnv,
    });
    child = preparation;
    await new Promise<void>((resolveBuild, rejectBuild) => {
      preparation.once('error', rejectBuild);
      preparation.once('exit', (code, signal) => {
        if (code === 0 && !signal) resolveBuild();
        else rejectBuild(new Error(`Asset build failed (${signal ?? code ?? 'unknown exit'}).`));
      });
    });
  }

  const nxArgs = ['run-many', '-t', 'serve', `--projects=${projects}`, ...outputArgs, ...passthroughArgs];
  child = spawn('pnpm', ['nx', ...nxArgs], { stdio: 'inherit', env: childEnv });
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

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((err) => {
    console.error(`[dev-serve] ${err.message}`);
    process.exit(1);
  });
}
