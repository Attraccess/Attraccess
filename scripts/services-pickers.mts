import React from 'react';
const h = React.createElement;
import { Box, Text, useInput } from 'ink';
import { useMemo, useState } from 'react';
import type { Action } from './services-config.mts';
import { ACTIONS, SETS } from './services-config.mts';

export function ActionPicker({ onSelect }: { onSelect: (action: Action) => void }) {
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
      h(Text, { key: action, color: idx === index ? 'cyan' : undefined }, `${idx === index ? '> ' : '  '}${action}`),
    ),
    h(Text, { dimColor: true }, 'Use Up/Down and Enter'),
  );
}

export function SetPicker({
  defaultSelected,
  onConfirm,
}: {
  defaultSelected: string[];
  onConfirm: (sets: string[]) => void;
}) {
  const setNames = useMemo(() => Object.keys(SETS), []);
  const [cursor, setCursor] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(defaultSelected));

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
        `${idx === cursor ? '> ' : '  '}${marker} ${name}`,
      );
    }),
    h(Text, { dimColor: true }, 'Space toggle, Enter confirm, "a" toggle all'),
  );
}

export function OutputScreen({
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
    h(Text, { dimColor: true }, 'Any key back to menu, q to exit'),
  );
}
