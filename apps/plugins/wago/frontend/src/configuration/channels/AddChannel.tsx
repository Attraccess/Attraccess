import { Button, Input, Label, TextField } from '@heroui/react';
import { useState } from 'react';
import { availableDigitalTerminals } from '../../../../backend/configuration/digital';
import type { ConfigurationEditorMetadata, WagoConfigurationSnapshot } from '../../api/client';
import { useWagoTranslations } from '../../i18n';
import { addDigitalChannel } from '../model';
import { canAddChannel, Purpose, purposes } from './ChannelWorkspace';
import { Choice, NumericField } from './DigitalChannelEditor';

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

type PurposeStepProps = Pick<
  ReturnType<typeof useAddChannelState>,
  'step' | 't' | 'purpose' | 'setPurpose' | 'onExternal'
>;

export function AddChannelPurposeStep({ step, t, purpose, setPurpose, onExternal }: PurposeStepProps) {
  return (
    <>
      {step === 0 && (
        <>
          <div className="wg:grid wg:gap-3 wg:sm:grid-cols-2">
            {purposes.map((item) => (
              <Button
                key={item.id}
                variant={purpose === item.id ? 'secondary' : 'outline'}
                aria-pressed={purpose === item.id}
                className="wg:h-auto wg:w-full wg:justify-start wg:whitespace-normal wg:p-4 wg:text-left"
                onPress={() => setPurpose(item.id)}
              >
                <item.icon className="wg:size-5 wg:shrink-0" />
                <span>
                  <strong className="wg:block">{t(`channels.purposes.${item.id}.label`)}</strong>
                  <span className="wg:font-normal wg:text-muted">{t(`channels.purposes.${item.id}.description`)}</span>
                </span>
              </Button>
            ))}
          </div>
          <p className="wg:text-sm wg:text-muted">{t('channels.externalHint')}</p>
          <Button variant="ghost" onPress={onExternal}>
            {t('channels.external')}
          </Button>
        </>
      )}
    </>
  );
}

type ChannelFormProps = Pick<
  ReturnType<typeof useAddChannelState>,
  | 't'
  | 'step'
  | 'purpose'
  | 'setPurpose'
  | 'onExternal'
  | 'name'
  | 'setName'
  | 'direction'
  | 'selectedTerminal'
  | 'terminals'
  | 'setAssignment'
  | 'pulseMs'
  | 'setPulseMs'
  | 'guardId'
  | 'inputs'
  | 'metadata'
  | 'setGuardId'
  | 'disconnect'
  | 'setDisconnect'
  | 'timeoutMs'
  | 'setTimeoutMs'
  | 'onCancel'
  | 'setStep'
  | 'valid'
  | 'create'
>;

export function AddChannelChannelsAdd({
  t,
  step,
  purpose,
  setPurpose,
  onExternal,
  name,
  setName,
  direction,
  selectedTerminal,
  terminals,
  setAssignment,
  pulseMs,
  setPulseMs,
  guardId,
  inputs,
  metadata,
  setGuardId,
  disconnect,
  setDisconnect,
  timeoutMs,
  setTimeoutMs,
  onCancel,
  setStep,
  valid,
  create,
}: ChannelFormProps) {
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
        <AddChannelPurposeStep {...{ step, t, purpose, setPurpose, onExternal }} />
        {step === 1 && (
          <>
            <TextField isRequired>
              <Label>{t('channels.newName')}</Label>
              <Input
                autoFocus
                maxLength={120}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t(direction === 'input' ? 'channels.inputPlaceholder' : 'channels.outputPlaceholder')}
              />
            </TextField>
            {!selectedTerminal ? (
              <p role="alert">{t('channels.allAssigned', { direction: t(`channels.${direction}`) })}</p>
            ) : (
              <Choice
                label={t('channels.assign')}
                value={String(selectedTerminal.channel)}
                options={terminals.map((item) => ({ id: String(item.channel), label: `CC100 ${item.label}` }))}
                onChange={(value) => setAssignment(Number(value))}
              />
            )}
            {purpose === 'pulse' && (
              <NumericField label={t('channels.pulseDuration')} value={pulseMs} min={1} onChange={setPulseMs} />
            )}
            {purpose === 'guard' && (
              <>
                <Choice
                  label={t('channels.guardInput')}
                  value={guardId}
                  options={inputs.map((item) => ({ id: item.id, label: metadata.names[item.id] || item.id }))}
                  onChange={setGuardId}
                />
                <p className="wg:text-sm wg:text-muted">{t('channels.guardHint')}</p>
                {!inputs.length && <p role="alert">{t('channels.inputFirst')}</p>}
              </>
            )}
            {direction === 'output' && (
              <>
                <Choice
                  label={t('channels.disconnect')}
                  value={disconnect}
                  options={[
                    { id: 'immediate', label: t('channels.immediate') },
                    { id: 'watchdog', label: t('channels.watchdog') },
                    { id: 'hold', label: t('channels.hold') },
                  ]}
                  onChange={setDisconnect}
                />
                {disconnect === 'watchdog' && (
                  <NumericField
                    label={t('channels.watchdogTimeout')}
                    min={1}
                    value={timeoutMs}
                    onChange={setTimeoutMs}
                  />
                )}
              </>
            )}
          </>
        )}
        {step === 2 && (
          <div className="wg:flex wg:flex-col wg:gap-3">
            <h3 className="wg:text-lg wg:font-semibold">{name.trim()}</h3>
            <p>
              {t(`channels.purposes.${purpose}.label`)} · CC100 {selectedTerminal?.label}
            </p>
            {purpose === 'pulse' && <p>{t('channels.pulseSummary', { duration: pulseMs })}</p>}
            {purpose === 'guard' && <p>{t('channels.guardSummary', { name: metadata.names[guardId] || guardId })}</p>}
            <p>
              {direction === 'input'
                ? t('channels.monitorSummary')
                : t('channels.disconnectSummary', {
                    policy:
                      disconnect === 'watchdog'
                        ? t('channels.watchdogSummary', { timeout: timeoutMs })
                        : t(`channels.${disconnect}`),
                  })}
            </p>
            <p className="wg:text-sm wg:text-muted">{t('channels.localHint')}</p>
          </div>
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

/** The wizard holds its own proposal. Nothing enters the working draft until confirmation. */
export function AddChannel({
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
  const model = useAddChannelState({ snapshot, metadata, terminal, onAdd, onCancel, onExternal });

  return (
    <AddChannelChannelsAdd
      {...{
        t: model.t,
        step: model.step,
        purpose: model.purpose,
        setPurpose: model.setPurpose,
        onExternal,
        name: model.name,
        setName: model.setName,
        direction: model.direction,
        selectedTerminal: model.selectedTerminal,
        terminals: model.terminals,
        setAssignment: model.setAssignment,
        pulseMs: model.pulseMs,
        setPulseMs: model.setPulseMs,
        guardId: model.guardId,
        inputs: model.inputs,
        metadata,
        setGuardId: model.setGuardId,
        disconnect: model.disconnect,
        setDisconnect: model.setDisconnect,
        timeoutMs: model.timeoutMs,
        setTimeoutMs: model.setTimeoutMs,
        onCancel,
        setStep: model.setStep,
        valid: model.valid,
        create: model.create,
      }}
    />
  );
}
