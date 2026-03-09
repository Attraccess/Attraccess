#!/usr/bin/env node
import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text, render, useApp, useInput } from 'ink';
import { execFile, spawn } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
import { promisify } from 'util';
import { fileURLToPath } from 'url';

const execFileAsync = promisify(execFile);
const h = React.createElement;

type ProgressCallback = (line: string) => void;

type Action = 'up' | 'stop' | 'down' | 'status' | 'list';

const ACTIONS: Action[] = ['up', 'stop', 'down', 'status', 'list'];

const DEFAULT_SETS = ['mailpit'];

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptPath);
const repoRoot = path.resolve(scriptDir, '..');
const composeFile = path.join(repoRoot, 'services.docker-compose.yml');
const gpuOverrideFile = path.join(repoRoot, 'docker-compose.gpu.yml');

type GpuResult = { enabled: boolean; reason: string };

async function detectGpu(): Promise<GpuResult> {
  if (process.argv.includes('--no-gpu') || process.env.OLLAMA_GPU === '0') {
    return { enabled: false, reason: 'GPU explicitly disabled' };
  }

  if (process.platform === 'darwin') {
    return { enabled: false, reason: 'macOS Docker does not support GPU passthrough. For GPU acceleration, run Ollama natively (brew install ollama)' };
  }

  if (!existsSync(gpuOverrideFile)) {
    return { enabled: false, reason: 'GPU override file not found' };
  }

  try {
    const { stdout } = await execFileAsync('docker', ['info', '--format', '{{json .Runtimes}}']);
    if (stdout.includes('nvidia')) {
      return { enabled: true, reason: 'NVIDIA container runtime detected' };
    }
  } catch {
    // docker info failed, fall through
  }

  try {
    await execFileAsync('nvidia-smi');
    return { enabled: true, reason: 'nvidia-smi found but nvidia container runtime not configured. Install nvidia-container-toolkit for Docker GPU support' };
  } catch {
    // no nvidia-smi
  }

  return { enabled: false, reason: 'No GPU runtime detected' };
}

let gpuResult: GpuResult | null = null;

async function getGpuResult(): Promise<GpuResult> {
  if (!gpuResult) {
    gpuResult = await detectGpu();
  }
  return gpuResult;
}

async function composeArgs(): Promise<string[]> {
  const args = ['-f', composeFile];
  const gpu = await getGpuResult();
  if (gpu.enabled) {
    args.push('-f', gpuOverrideFile);
  }
  return args;
}

async function runCompose(
  args: string[],
  onProgress?: ProgressCallback
): Promise<{ stdout: string; stderr: string }> {
  const baseArgs = ['compose', ...(await composeArgs()), ...args];
  if (!onProgress) {
    const { stdout, stderr } = await execFileAsync(
      'docker',
      baseArgs,
      { env: process.env, maxBuffer: 1024 * 1024 * 10 }
    );
    return { stdout, stderr };
  }

  return new Promise((resolve, reject) => {
    const proc = spawn('docker', baseArgs, {
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    const handleData = (chunk: Buffer) => {
      const text = chunk.toString();
      stdout += text;
      for (const line of text.split(/\r?\n/).filter(Boolean)) {
        onProgress(line);
      }
    };

    const handleStderr = (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      for (const line of text.split(/\r?\n/).filter(Boolean)) {
        onProgress(line);
      }
    };

    proc.stdout.on('data', handleData);
    proc.stderr.on('data', handleStderr);
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `docker compose exited with code ${code}`));
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

async function getServicesAndSets(): Promise<{ allServices: string[]; sets: Record<string, string[]> }> {
  const { stdout } = await runCompose(['config', '--format', 'json']);
  const config = JSON.parse(stdout);
  const sets: Record<string, string[]> = {};
  const allServices: string[] = [];

  for (const [name, service] of Object.entries(config.services ?? {})) {
    allServices.push(name);
    const setName =
      (service as { labels?: Record<string, string> }).labels?.[
        'attraccess.set'
      ] ?? name;
    if (!sets[setName]) {
      sets[setName] = [];
    }
    sets[setName].push(name);
  }

  return { allServices, sets };
}

function printUsage(sets: Record<string, string[]>): void {
  console.log(`Usage: pnpm services -- [up|stop|down|status|list] [set|service ...] [--no-gpu]

Sets:
  ${Object.keys(sets).join(', ')}

Options:
  --no-gpu   Disable GPU auto-detection and run Ollama on CPU only.
             Can also be disabled via OLLAMA_GPU=0 environment variable.
             GPU is auto-detected and enabled by default when available.

Examples:
  pnpm services
  pnpm services -- up mailpit authentik
  pnpm services -- up ollama
  pnpm services -- up ollama --no-gpu
  pnpm services -- up all
  pnpm services -- stop mailpit
  pnpm services -- down
`);
}

function resolveSelectedServices(
  tokens: string[],
  allServices: string[],
  sets: Record<string, string[]>
): string[] {
  if (tokens.includes('all')) {
    return [...allServices];
  }

  const allServiceSet = new Set(allServices);
  const selected = new Set<string>();

  for (const token of tokens) {
    if (sets[token]) {
      for (const service of sets[token]) {
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

function buildStopList(
  allServices: string[],
  selectedServices: string[]
): string[] {
  const selected = new Set(selectedServices);
  return allServices.filter((service) => !selected.has(service));
}

async function handleAction(
  action: Action,
  tokens: string[],
  onProgress?: ProgressCallback
): Promise<string> {
  if (!existsSync(composeFile)) {
    throw new Error(`Compose file not found: ${composeFile}`);
  }

  const { allServices, sets } = await getServicesAndSets();

  if (allServices.length === 0) {
    throw new Error(`No services found in ${composeFile}`);
  }

  if (action === 'list') {
    const setsList = Object.entries(sets)
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
    onProgress?.('Stopping all services...');
    await runCompose(['down'], onProgress);
    return 'All services stopped.';
  }

  const selectedTokens = tokens.length === 0 ? DEFAULT_SETS : tokens;
  const selectedServices = resolveSelectedServices(
    selectedTokens,
    allServices,
    sets
  );

  if (selectedServices.length === 0) {
    throw new Error('No services selected.');
  }

  if (action === 'up') {
    const toStop = buildStopList(allServices, selectedServices);
    if (toStop.length > 0) {
      onProgress?.(`Stopping ${toStop.length} other service(s)...`);
      await runCompose(['stop', ...toStop], onProgress);
    }
    if (selectedServices.includes('ollama')) {
      const gpu = await getGpuResult();
      onProgress?.(`GPU: ${gpu.reason}${gpu.enabled ? ' (enabled)' : ''}`);
    }
    onProgress?.(`Starting: ${selectedServices.join(', ')}...`);
    await runCompose(['up', '-d', ...selectedServices], onProgress);
    return `Started: ${selectedServices.join(', ')}`;
  }

  if (action === 'stop') {
    onProgress?.(`Stopping: ${selectedServices.join(', ')}...`);
    await runCompose(['stop', ...selectedServices], onProgress);
    return `Stopped: ${selectedServices.join(', ')}`;
  }

  throw new Error(`Unknown action: ${action}`);
}

function ActionPicker({ onSelect }: { onSelect: (action: Action) => void }) {
  const [index, setIndex] = useState(0);

  useInput((_input, key) => {
    if (key.upArrow) {
      setIndex((prev) => (prev === 0 ? ACTIONS.length - 1 : prev - 1));
    }
    if (key.downArrow) {
      setIndex((prev) => (prev === ACTIONS.length - 1 ? 0 : prev + 1));
    }
    if (key.return) {
      onSelect(ACTIONS[index]);
    }
  });

  return h(
    Box,
    { flexDirection: 'column' },
    h(Text, null, 'Select action:'),
    ...ACTIONS.map((action, idx) =>
      h(
        Text,
        { key: action, color: idx === index ? 'cyan' : undefined },
        `${idx === index ? '> ' : '  '}${action}`
      )
    ),
    h(Text, { dimColor: true }, 'Use Up/Down and Enter')
  );
}

function SetPicker({
  sets,
  defaultSelected,
  onConfirm,
}: {
  sets: Record<string, string[]>;
  defaultSelected: string[];
  onConfirm: (sets: string[]) => void;
}) {
  const setNames = useMemo(() => Object.keys(sets), [sets]);
  const [cursor, setCursor] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(defaultSelected)
  );

  useInput((input, key) => {
    if (key.upArrow) {
      setCursor((prev) => (prev === 0 ? setNames.length - 1 : prev - 1));
    }
    if (key.downArrow) {
      setCursor((prev) => (prev === setNames.length - 1 ? 0 : prev + 1));
    }
    if (key.return) {
      onConfirm([...selected]);
    }
    if (input === ' ') {
      const current = setNames[cursor];
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(current)) {
          next.delete(current);
        } else {
          next.add(current);
        }
        return next;
      });
    }
    if (input === 'a') {
      setSelected((prev) => {
        if (prev.size === setNames.length) {
          return new Set();
        }
        return new Set(setNames);
      });
    }
  });

  return h(
    Box,
    { flexDirection: 'column' },
    h(Text, null, 'Select service sets:'),
    ...setNames.map((name, idx) => {
      const checked = selected.has(name);
      const marker = checked ? '[x]' : '[ ]';
      return h(
        Text,
        { key: name, color: idx === cursor ? 'cyan' : undefined },
        `${idx === cursor ? '> ' : '  '}${marker} ${name}`
      );
    }),
    h(Text, { dimColor: true }, 'Space toggle, Enter confirm, "a" toggle all')
  );
}

function OutputScreen({
  title,
  output,
  isError,
  onBack,
}: {
  title: string;
  output: string;
  isError?: boolean;
  onBack: () => void;
}) {
  useInput((input, key) => {
    if (input === 'q') {
      onBack();
      return;
    }
    if (key.return || key.escape || key.space || input) {
      onBack();
    }
  });

  const lines = output.split(/\r?\n/).filter((line) => line.length > 0);
  const body =
    lines.length === 0
      ? [h(Text, { key: 'none' }, '(no output)')]
      : lines.map((line, idx) => h(Text, { key: `${line}-${idx}` }, line));

  return h(
    Box,
    { flexDirection: 'column' },
    h(Text, { color: isError ? 'red' : 'green' }, title),
    ...body,
    h(Text, { dimColor: true }, 'Any key back to menu, q to exit')
  );
}

function ProgressScreen({ lines }: { lines: string[] }) {
  const visible = lines.slice(-10);
  return h(
    Box,
    { flexDirection: 'column' },
    h(Text, { color: 'yellow' }, 'Working...'),
    ...visible.map((line, idx) =>
      h(Text, { key: `${idx}-${line}`, dimColor: true }, line)
    )
  );
}

function App({ sets }: { sets: Record<string, string[]> }) {
  const [action, setAction] = useState<Action | null>(null);
  const [selectedSets, setSelectedSets] = useState<string[] | null>(null);
  const [output, setOutput] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [progressLines, setProgressLines] = useState<string[]>([]);
  const { exit } = useApp();

  useInput((input) => {
    if (input === 'q') {
      exit();
    }
  });

  const resetToMenu = () => {
    setAction(null);
    setSelectedSets(null);
    setOutput('');
    setError('');
    setProgressLines([]);
  };

  const onProgress = (line: string) => {
    setProgressLines((prev) => [...prev, line].slice(-20));
  };

  useEffect(() => {
    if (!action) return;

    if (action === 'down' || action === 'status' || action === 'list') {
      void (async () => {
        try {
          const result = await handleAction(action, [], onProgress);
          setOutput(result);
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        }
      })();
    }
  }, [action]);

  useEffect(() => {
    if (!action || !selectedSets) return;

    void (async () => {
      try {
        const result = await handleAction(action, selectedSets, onProgress);
        setOutput(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
  }, [action, selectedSets]);

  if (!action) {
    return h(ActionPicker, { onSelect: setAction });
  }

  if (action === 'up' || action === 'stop') {
    if (!selectedSets) {
      return h(SetPicker, {
        sets,
        defaultSelected: DEFAULT_SETS,
        onConfirm: setSelectedSets,
      });
    }
  }

  if (error) {
    return h(OutputScreen, {
      title: 'Error',
      output: error,
      isError: true,
      onBack: resetToMenu,
    });
  }

  if (output) {
    return h(OutputScreen, { title: 'Done', output, onBack: resetToMenu });
  }

  return h(ProgressScreen, { lines: progressLines });
}

async function runCli(): Promise<void> {
  const rawArgs = process.argv.slice(2).filter((arg) => arg !== '--gpu' && arg !== '--no-gpu');
  const [actionRaw, ...tokens] = rawArgs;
  const action = (actionRaw || 'up') as Action;

  if (actionRaw === 'help' || actionRaw === '--help' || actionRaw === '-h') {
    const { sets } = await getServicesAndSets();
    printUsage(sets);
    return;
  }

  const result = await handleAction(action, tokens);
  if (result.trim()) {
    console.log(result);
  }
}

async function main(): Promise<void> {
  if (!existsSync(composeFile)) {
    console.error(`Compose file not found: ${composeFile}`);
    process.exitCode = 1;
    return;
  }

  const hasArgs = process.argv.slice(2).length > 0;
  if (hasArgs || !process.stdin.isTTY) {
    try {
      await runCli();
    } catch (err) {
      console.error(err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    }
    return;
  }

  const { sets } = await getServicesAndSets();
  render(h(App, { sets }));
}

void main();
