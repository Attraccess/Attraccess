import { Button, Input, Label, TextField } from '@heroui/react';
import { Choice, NumericField } from './DigitalChannelEditor';
import { AddChannelPurposeStep } from './AddChannelPurposeStep';
import { useAddChannelState } from './useAddChannelState';
type Props = Pick<
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
}: Props) {
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
