import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, expect, it, vi } from 'vitest';
import { DigitalChannelEditor } from './DigitalChannelEditor';
import type { Channel } from './configuration-model';
import type { WagoConfigurationSnapshot } from './api';

afterEach(cleanup);
const input: Channel = {
  id: 'input',
  physicalPointId: 'di',
  profile: 'generic-monitored-input',
  capabilities: ['input'],
  disconnectPolicy: { mode: 'hold' },
};
const output: Channel = {
  id: 'output',
  physicalPointId: 'do',
  profile: 'pulsed-lock-bank',
  capabilities: ['output', 'pulse', 'guard', 'feedback'],
  disconnectPolicy: { mode: 'watchdog', timeoutMs: 1200 },
  pulse: { durationMs: 500 },
  guard: { channelId: 'input', when: 'on' },
  feedback: { channelId: 'input', expected: 'match', timeoutMs: 900 },
};
function Editor({
  initial,
  onRename = vi.fn(),
  onRemove = vi.fn(),
}: {
  initial: Channel;
  onRename?: (id: string, name: string) => void;
  onRemove?: () => void;
}) {
  const [channel, setChannel] = useState(initial);
  const snapshot: WagoConfigurationSnapshot = {
    version: 1,
    physicalPoints: [
      { id: 'do', hardwareProfile: '751-9301', channel: 0 },
      { id: 'di', hardwareProfile: '751-9301', channel: 4 },
    ],
    logicalChannels: [channel, channel.id === 'output' ? input : output],
  };
  return (
    <>
      <DigitalChannelEditor
        channel={channel}
        snapshot={snapshot}
        metadata={{ names: { input: 'Door contact', output: 'Door lock' }, presets: [] }}
        onChange={setChannel}
        onRename={onRename}
        onRemove={onRemove}
        onAssign={vi.fn()}
      />
      <output aria-label="Working channel">{JSON.stringify(channel)}</output>
    </>
  );
}
it('edits pulse, feedback, and watchdog durations while retaining the selected guard input', () => {
  const onRename = vi.fn(),
    onRemove = vi.fn();
  render(<Editor initial={output} onRename={onRename} onRemove={onRemove} />);
  for (const [label, value] of [
    ['Pulse duration (ms)', '750'],
    ['Feedback timeout (ms)', '1500'],
    ['Watchdog timeout (ms)', '2500'],
  ])
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  expect(JSON.parse(screen.getByLabelText('Working channel').textContent ?? '')).toMatchObject({
    pulse: { durationMs: 750 },
    feedback: { channelId: 'input', expected: 'match', timeoutMs: 1500 },
    guard: { channelId: 'input', when: 'on' },
    disconnectPolicy: { mode: 'watchdog', timeoutMs: 2500 },
  });
  fireEvent.change(screen.getByLabelText('Channel name'), { target: { value: 'New lock name' } });
  expect(onRename).toHaveBeenCalledWith('output', 'New lock name');
  fireEvent.click(screen.getByRole('button', { name: 'Remove channel' }));
  expect(onRemove).toHaveBeenCalledOnce();
});
it('removes disabled guard and feedback settings instead of retaining hidden constraints', () => {
  render(<Editor initial={output} />);
  fireEvent.click(screen.getByRole('checkbox', { name: 'Operational guard' }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Monitor feedback' }));
  const channel = JSON.parse(screen.getByLabelText('Working channel').textContent ?? '');
  expect(channel.capabilities).toEqual(['output', 'pulse']);
  expect(channel).not.toHaveProperty('guard');
  expect(channel).not.toHaveProperty('feedback');
});
it('edits and clears an input expected range without adding output capabilities', () => {
  render(<Editor initial={{ ...input, range: { minimum: 0, maximum: 1 } }} />);
  fireEvent.change(screen.getByLabelText('Minimum'), { target: { value: '-0.5' } });
  fireEvent.change(screen.getByLabelText('Maximum'), { target: { value: '2.5' } });
  expect(JSON.parse(screen.getByLabelText('Working channel').textContent ?? '')).toMatchObject({
    range: { minimum: -0.5, maximum: 2.5 },
    capabilities: ['input'],
  });
  fireEvent.click(screen.getByRole('checkbox', { name: 'Expected value range' }));
  expect(JSON.parse(screen.getByLabelText('Working channel').textContent ?? '')).not.toHaveProperty('range');
});
