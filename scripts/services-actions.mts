import { execFile } from 'child_process';
import { existsSync } from 'fs';
import { promisify } from 'util';
import type { Action } from './services-config.mts';
import { composeFile, DEFAULT_SETS, SETS } from './services-config.mts';

export const execFileAsync = promisify(execFile);

export async function runCompose(args: string[]): Promise<{ stdout: string; stderr: string }> {
  const { stdout, stderr } = await execFileAsync('docker', ['compose', '-f', composeFile, ...args], {
    env: process.env,
    maxBuffer: 1024 * 1024 * 10,
  });
  return { stdout, stderr };
}

export async function getComposeServices(): Promise<string[]> {
  const { stdout } = await runCompose(['config', '--services']);
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function resolveSelectedServices(tokens: string[], allServices: string[]): string[] {
  if (tokens.includes('all')) {
    return [...allServices];
  }

  const allServiceSet = new Set(allServices);
  const selected = new Set<string>();

  for (const token of tokens) {
    if (SETS[token]) {
      for (const service of SETS[token]) {
        selected.add(service);
      }
      continue;
    }

    if (allServiceSet.has(token)) {
      selected.add(token);
      continue;
    }

    throw new Error(`Unknown set or service: ${token}`);
  }

  return [...selected];
}

export function buildStopList(allServices: string[], selectedServices: string[]): string[] {
  const selected = new Set(selectedServices);
  return allServices.filter((service) => !selected.has(service));
}

export async function handleAction(action: Action, tokens: string[]): Promise<string> {
  if (!existsSync(composeFile)) {
    throw new Error(`Compose file not found: ${composeFile}`);
  }

  const allServices = await getComposeServices();
  if (allServices.length === 0) {
    throw new Error(`No services found in ${composeFile}`);
  }

  if (action === 'list') {
    const setsList = Object.entries(SETS)
      .map(([name, services]) => `  ${name}: ${services.join(' ')}`)
      .join('\n');
    const servicesList = allServices.map((svc) => `  ${svc}`).join('\n');
    return `Sets:\n${setsList}\n\nServices:\n${servicesList}\n`;
  }

  if (action === 'status') {
    const { stdout } = await runCompose(['ps']);
    return stdout.trim() || 'No running services.';
  }

  if (action === 'down') {
    await runCompose(['down']);
    return 'All services stopped.';
  }

  const selectedTokens = tokens.length === 0 ? DEFAULT_SETS : tokens;
  const selectedServices = resolveSelectedServices(selectedTokens, allServices);

  if (selectedServices.length === 0) {
    throw new Error('No services selected.');
  }

  if (action === 'up') {
    const toStop = buildStopList(allServices, selectedServices);
    if (toStop.length > 0) {
      await runCompose(['stop', ...toStop]);
    }
    await runCompose(['up', '-d', ...selectedServices]);
    return `Started: ${selectedServices.join(', ')}`;
  }

  if (action === 'stop') {
    await runCompose(['stop', ...selectedServices]);
    return `Stopped: ${selectedServices.join(', ')}`;
  }

  throw new Error(`Unknown action: ${action}`);
}

export function printUsage(): void {
  console.log(`Usage: pnpm services -- [up|stop|down|status|list] [set|service ...]

Sets:
  ${Object.keys(SETS).join(', ')}

Examples:
  pnpm services
  pnpm services -- up mailpit authentik
  pnpm services -- up all
  pnpm services -- stop mailpit
  pnpm services -- down
`);
}
