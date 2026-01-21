#!/usr/bin/env node
import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text, render, useApp, useInput } from 'ink';
import { execFile } from 'child_process';
import { existsSync } from 'fs';
import path from 'path';
import { promisify } from 'util';
import { fileURLToPath } from 'url';

const execFileAsync = promisify(execFile);
const h = React.createElement;

type Action = 'up' | 'stop' | 'down' | 'status' | 'list';

const ACTIONS: Action[] = ['up', 'stop', 'down', 'status', 'list'];

const SETS: Record<string, string[]> = {
  mailpit: ['mailpit'],
  authentik: [
    'authentik-postgresql',
    'authentik-redis',
    'authentik-server',
    'authentik-worker',
  ],
  keycloak: ['keycloak'],
  'webhook-site': ['webhook-site'],
  bunkerm: ['bunkerm'],
  zigbee2mqtt: ['zigbee2mqtt'],
};

const DEFAULT_SETS = ['mailpit'];

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptPath);
const repoRoot = path.resolve(scriptDir, '..');
const composeFile = path.join(repoRoot, 'services.docker-compose.yml');

function printUsage(): void {
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

async function runCompose(
  args: string[]
): Promise<{ stdout: string; stderr: string }> {
  const { stdout, stderr } = await execFileAsync(
    'docker',
    ['compose', '-f', composeFile, ...args],
    { env: process.env, maxBuffer: 1024 * 1024 * 10 }
  );
  return { stdout, stderr };
}

async function getComposeServices(): Promise<string[]> {
  const { stdout } = await runCompose(['config', '--services']);
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function resolveSelectedServices(
  tokens: string[],
  allServices: string[]
): string[] {
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

function buildStopList(
  allServices: string[],
  selectedServices: string[]
): string[] {
  const selected = new Set(selectedServices);
  return allServices.filter((service) => !selected.has(service));
}

async function handleAction(action: Action, tokens: string[]): Promise<string> {
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
  defaultSelected,
  onConfirm,
}: {
  defaultSelected: string[];
  onConfirm: (sets: string[]) => void;
}) {
  const setNames = useMemo(() => Object.keys(SETS), []);
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

function App() {
  const [action, setAction] = useState<Action | null>(null);
  const [selectedSets, setSelectedSets] = useState<string[] | null>(null);
  const [output, setOutput] = useState<string>('');
  const [error, setError] = useState<string>('');
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
  };

  useEffect(() => {
    if (!action) return;

    if (action === 'down' || action === 'status' || action === 'list') {
      void (async () => {
        try {
          const result = await handleAction(action, []);
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
        const result = await handleAction(action, selectedSets);
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

  return h(Box, { flexDirection: 'column' }, h(Text, null, 'Working...'));
}

async function runCli(): Promise<void> {
  const [actionRaw, ...tokens] = process.argv.slice(2);
  const action = (actionRaw || 'up') as Action;

  if (actionRaw === 'help' || actionRaw === '--help' || actionRaw === '-h') {
    printUsage();
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

  render(h(App, null));
}

void main();
