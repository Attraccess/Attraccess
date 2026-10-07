import { Input, Label, Switch, TextField } from '@heroui/react';
import { useState } from 'react';
import { outputBehavior } from '../../../channel-behavior';
import { Choice, NumericField } from '../DigitalChannelEditor';
import { useWagoTranslations } from '../i18n';
import { terminalChannel, terminalName, updateTerminal, type PanelConfiguration, type Terminal } from './model';
import { SettingsDrawer } from './SettingsDrawer.helpers';

export function TerminalSettings({
  configuration,
  terminal,
  onChange,
  onClose,
}: {
  configuration: PanelConfiguration;
  terminal: Terminal;
  onChange: (configuration: PanelConfiguration) => void;
  onClose: () => void;
}) {
  const { t } = useWagoTranslations();
  const existing = terminalChannel(configuration.snapshot, terminal);
  const [name, setName] = useState(terminalName(configuration, terminal));
  const [behavior, setBehavior] = useState(
    outputBehavior(existing ?? { capabilities: [] }) === 'pulsed' ? 'pulse' : 'set',
  );
  const [pulseSeconds, setPulseSeconds] = useState((existing?.pulse?.durationMs ?? 1000) / 1000);
  const [policy, setPolicy] = useState(existing?.disconnectPolicy.mode ?? 'immediate');
  const [timeout, setTimeout] = useState((existing?.disconnectPolicy.timeoutMs ?? 30000) / 1000);
  const [invert, setInvert] = useState(existing?.invert ?? false);
  const save = () => {
    const settings =
      terminal.direction === 'input'
        ? { invert }
        : {
            capabilities: [
              ...(existing?.capabilities ?? ['output']).filter((item) => item !== 'pulse'),
              ...(behavior === 'pulse' ? ['pulse' as const] : []),
            ],
            pulse: behavior === 'pulse' ? { durationMs: Math.round(pulseSeconds * 1000) } : undefined,
            disconnectPolicy:
              policy === 'watchdog' ? { mode: policy, timeoutMs: Math.round(timeout * 1000) } : { mode: policy },
          };
    onChange(updateTerminal(configuration, terminal, name, settings));
    onClose();
  };
  return (
    <SettingsDrawer
      title={t(`panel.${terminal.direction}Title`, { terminal: terminal.label })}
      onClose={onClose}
      onSave={save}
    >
      <TextField>
        <Label>{t('panel.name')}</Label>
        <Input maxLength={120} value={name} onChange={(event) => setName(event.target.value)} />
      </TextField>
      <p className="wg:text-sm wg:text-muted">{t('panel.emptyName')}</p>
      {terminal.direction === 'input' ? (
        <Switch isSelected={invert} onChange={setInvert}>
          <Switch.Content>
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
            <Label>{t('panel.invert')}</Label>
          </Switch.Content>
        </Switch>
      ) : (
        <>
          <Choice
            label={t('panel.behavior')}
            value={behavior}
            onChange={setBehavior}
            options={['set', 'pulse'].map((id) => ({ id, label: t(`panel.behaviorOptions.${id}`) }))}
          />
          {behavior === 'pulse' && (
            <NumericField
              label={t('panel.pulseLength')}
              value={pulseSeconds}
              min={0.001}
              integer={false}
              onChange={setPulseSeconds}
            />
          )}
          <Choice
            label={t('panel.disconnect')}
            value={policy}
            onChange={(value) => setPolicy(value as typeof policy)}
            options={['immediate', 'hold', 'watchdog'].map((id) => ({ id, label: t(`panel.disconnectOptions.${id}`) }))}
          />
          {policy === 'watchdog' && (
            <NumericField
              label={t('panel.timeout')}
              value={timeout}
              min={0.001}
              integer={false}
              onChange={setTimeout}
            />
          )}
        </>
      )}
    </SettingsDrawer>
  );
}
