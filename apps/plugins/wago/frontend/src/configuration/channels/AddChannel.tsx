import { Button } from '@heroui/react';
import { useState } from 'react';
import { availableDigitalTerminals } from '../../../../backend/configuration/digital';
import type { ConfigurationEditorMetadata, WagoConfigurationSnapshot } from '../../api/client';
import { useWagoTranslations } from '../../i18n';
import { addDigitalChannel } from '../model';
import { AddChannelConfirmStep } from './AddChannelConfirmStep';
import { AddChannelDetailsStep } from './AddChannelDetailsStep';
import { AddChannelPurposeStep } from './AddChannelPurposeStep';
import { canAddChannel, type AddChannelDraft } from './channelWorkspaceModel';

interface AddChannelProps {
  snapshot: WagoConfigurationSnapshot;
  metadata: ConfigurationEditorMetadata;
  terminal?: number;
  onAdd: (snapshot: WagoConfigurationSnapshot, metadata: ConfigurationEditorMetadata, selected: string) => void;
  onCancel: () => void;
  onExternal: () => void;
}

/** The wizard holds its own proposal. Nothing enters the working draft until confirmation. */
export function AddChannel({ snapshot, metadata, terminal, onAdd, onCancel, onExternal }: AddChannelProps) {
  const { t } = useWagoTranslations();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<AddChannelDraft>({
    purpose: terminal !== undefined && terminal >= 4 ? 'input' : 'output',
    name: '',
    assignment: terminal,
    pulseMs: 500,
    guardId: '',
    disconnect: 'immediate',
    timeoutMs: 1000,
  });
  const patchDraft = (patch: Partial<AddChannelDraft>) => setDraft((current) => ({ ...current, ...patch }));
  const { purpose, name, assignment, pulseMs, guardId, disconnect, timeoutMs } = draft;
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

  return (
    <section
      aria-label={t('channels.add')}
      className="wg:w-full wg:min-w-0 wg:space-y-5 wg:rounded-xl wg:border wg:border-border wg:p-4 wg:[overflow-wrap:anywhere]"
    >
      <header className="wg:space-y-1">
        <h3 className="wg:font-semibold">{t('channels.addTitle')}</h3>
        <p className="wg:text-sm wg:text-muted">{t('channels.addDescription')}</p>
      </header>
      <div className="wg:flex wg:flex-col wg:gap-5">
        <ol className="wg:flex wg:flex-wrap wg:gap-4 wg:text-sm" aria-label={t('channels.progress')}>
          {['channels.purpose', 'channels.wiringBehavior', 'channels.confirm'].map((label, index) => (
            <li
              key={label}
              aria-current={step === index ? 'step' : undefined}
              className={step === index ? 'wg:font-semibold wg:text-accent' : 'wg:text-muted'}
            >
              {index + 1}. {t(label)}
            </li>
          ))}
        </ol>
        {step === 0 && (
          <AddChannelPurposeStep
            purpose={purpose}
            onPurposeChange={(next) => patchDraft({ purpose: next })}
            onExternal={onExternal}
          />
        )}
        {step === 1 && (
          <AddChannelDetailsStep
            draft={draft}
            onDraftChange={patchDraft}
            direction={direction}
            terminals={terminals}
            selectedTerminal={selectedTerminal}
            inputs={inputs}
            metadata={metadata}
          />
        )}
        {step === 2 && (
          <AddChannelConfirmStep
            draft={draft}
            direction={direction}
            selectedTerminal={selectedTerminal}
            metadata={metadata}
          />
        )}
      </div>
      <footer className="wg:flex wg:flex-wrap wg:justify-between wg:gap-3">
        <Button variant="ghost" onPress={onCancel}>
          {t('channels.cancelAdd')}
        </Button>
        <div className="wg:flex wg:gap-2">
          {step > 0 && (
            <Button variant="secondary" onPress={() => setStep(step - 1)}>
              {t('channels.back')}
            </Button>
          )}
          {step < 2 ? (
            <Button isDisabled={step === 1 && !valid} onPress={() => setStep(step + 1)}>
              {t('channels.continue')}
            </Button>
          ) : (
            <Button isDisabled={!valid} onPress={create}>
              {t('channels.addToConfiguration')}
            </Button>
          )}
        </div>
      </footer>
    </section>
  );
}
