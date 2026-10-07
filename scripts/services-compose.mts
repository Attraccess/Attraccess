#!/usr/bin/env node
import { existsSync } from 'fs';
import { Box, Text, render, useApp, useInput } from 'ink';
import path from 'path';
import React, { useEffect, useState } from 'react';
import { pathToFileURL } from 'url';
import { handleAction, printUsage } from './services-actions.mts';
import { Action } from './services-config.mts';
import { DEFAULT_SETS, composeFile } from './services-config.mts';
import { ActionPicker, OutputScreen, SetPicker } from './services-pickers.mts';

const h = React.createElement;

export function App() {
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

export async function main(): Promise<void> {
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

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) void main();

export { handleAction, resolveSelectedServices } from './services-actions.mts';
