import { useState } from 'react';
import type { ConfigurationEditorMetadata, WagoConfigurationSnapshot } from './api';
import { addDigitalChannel } from './configuration-model';
import { availableDigitalTerminals } from '../../backend/configuration-digital';
import { useWagoTranslations } from './i18n';
import { Purpose } from './ChannelWorkspace.purpose';
import { canAddChannel } from './ChannelWorkspace.helpers';
export function useAddChannelState({
  snapshot,
  metadata,
  terminal,
  onAdd,
  onCancel,
  onExternal,
}: {
  snapshot: WagoConfigurationSnapshot;
  metadata: ConfigurationEditorMetadata;
  terminal?: number;
  onAdd: (snapshot: WagoConfigurationSnapshot, metadata: ConfigurationEditorMetadata, selected: string) => void;
  onCancel: () => void;
  onExternal: () => void;
}) {
  const { t } = useWagoTranslations();
  const [step, setStep] = useState(0);
  const [purpose, setPurpose] = useState<Purpose>(terminal !== undefined && terminal >= 4 ? 'input' : 'output');
  const [name, setName] = useState('');
  const [assignment, setAssignment] = useState<number | undefined>(terminal);
  const [pulseMs, setPulseMs] = useState(500);
  const [guardId, setGuardId] = useState('');
  const [disconnect, setDisconnect] = useState('immediate');
  const [timeoutMs, setTimeoutMs] = useState(1000);
  const direction = purpose === 'input' ? 'input' : 'output';
  const terminals = availableDigitalTerminals(snapshot, direction);
  const selectedTerminal = terminals.find((item) => item.channel === assignment) ?? terminals[0];
  const inputs = snapshot.logicalChannels.filter((item) => item.capabilities.includes('input'));
  const valid = canAddChannel({ name, purpose, pulseMs, guardId, disconnect, timeoutMs }, !!selectedTerminal, inputs);

  function create() {
    if (!valid || !selectedTerminal) return;
    const next = addDigitalChannel(snapshot, direction);
    next.point.channel = selectedTerminal.channel;
    if (purpose === 'pulse') {
      next.channel.profile = 'pulsed-lock-bank';
      next.channel.capabilities.push('pulse');
      next.channel.pulse = { durationMs: pulseMs };
    }
    if (purpose === 'guard') {
      next.channel.profile = 'guarded-enable-request';
      next.channel.capabilities.push('guard');
      next.channel.guard = { channelId: guardId, when: 'on' };
    }
    if (direction === 'output')
      next.channel.disconnectPolicy =
        disconnect === 'watchdog' ? { mode: 'watchdog', timeoutMs } : { mode: disconnect as 'hold' | 'immediate' };
    const presets =
      purpose === 'pulse' || purpose === 'guard'
        ? [
            ...metadata.presets,
            {
              presetId: next.channel.profile,
              channelId: next.channel.id,
              physicalPointId: next.point.id,
              ...(purpose === 'guard' ? { guardChannelId: guardId } : {}),
            },
          ]
        : metadata.presets;
    onAdd(
      next.snapshot,
      {
        ...metadata,
        presets,
        names: { ...metadata.names, [next.channel.id]: name.trim(), [next.point.id]: selectedTerminal.label },
      },
      next.channel.id,
    );
  }
  return {
    t,
    step,
    setStep,
    purpose,
    setPurpose,
    name,
    setName,
    setAssignment,
    pulseMs,
    setPulseMs,
    guardId,
    setGuardId,
    disconnect,
    setDisconnect,
    timeoutMs,
    setTimeoutMs,
    direction,
    terminals,
    selectedTerminal,
    inputs,
    valid,
    create,
    metadata,
    onCancel,
    onExternal,
  } as const;
}
