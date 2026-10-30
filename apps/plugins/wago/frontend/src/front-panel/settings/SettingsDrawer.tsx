import { Button, LabeledSwitch, StandardDrawer } from '@attraccess/plugins-frontend-ui';
import { Drawer, Form, Input, Label, TextField } from '@heroui/react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { outputBehavior } from '../../../../channel-behavior';
import type { ModbusConnection } from '../../../../modbus/model';
import { Choice, NumericField } from '../../configuration/channels/DigitalChannelEditor';
import { useWagoTranslations } from '../../i18n';
import type { PanelConfiguration } from '../model';
import { busConnection, terminalChannel, terminalName, updateBus, updateTerminal, type Terminal } from '../model';

export function SettingsDrawer({
  title,
  onClose,
  onSave,
  children,
  remove,
  isSaveDisabled = false,
}: {
  title: string;
  onClose: () => void;
  onSave: () => void;
  /** The settings cannot be saved as they are; the body explains why. */
  isSaveDisabled?: boolean;
  children: ReactNode;
  remove?: ReactNode;
}) {
  const { t } = useWagoTranslations();
  return (
    <StandardDrawer
      isOpen
      onOpenChange={(open) => !open && onClose()}
      contentProps={{ placement: 'right' }}
      dialogProps={{ 'aria-label': title, className: 'wg:w-full wg:max-w-full wg:sm:max-w-xl' }}
    >
      <Form
        className="wg:flex wg:h-full wg:min-h-0 wg:flex-col"
        onSubmit={(event) => {
          event.preventDefault();
          onSave();
        }}
      >
        <Drawer.Header>
          <Drawer.Heading>{title}</Drawer.Heading>
          <Drawer.CloseTrigger aria-label={t('panel.closeSettings')} />
        </Drawer.Header>
        <Drawer.Body className="wg:flex wg:flex-col wg:gap-5">{children}</Drawer.Body>
        <Drawer.Footer className="wg:flex wg:flex-wrap wg:gap-2">
          {remove}
          <Button variant="secondary" onPress={onClose}>
            {t('panel.cancel')}
          </Button>
          <Button type="submit" isDisabled={isSaveDisabled}>
            {t('panel.done')}
          </Button>
        </Drawer.Footer>
      </Form>
    </StandardDrawer>
  );
}

export function BusSettings({
  configuration,
  onChange,
  onClose,
}: {
  configuration: PanelConfiguration;
  onChange: (configuration: PanelConfiguration) => void;
  onClose: () => void;
}) {
  const { t } = useWagoTranslations();
  const [bus, setBus] = useState(
    busConnection(configuration.snapshot) as Extract<ModbusConnection, { transport: 'rtu' }>,
  );
  return (
    <SettingsDrawer
      title={t('panel.busTitle')}
      onClose={onClose}
      onSave={() => {
        onChange(updateBus(configuration, bus));
        onClose();
      }}
    >
      <p className="wg:text-sm wg:text-muted">{t('panel.sharedBus')}</p>
      <Choice
        label={t('modbus.baud')}
        value={String(bus.baudRate)}
        onChange={(value) => setBus({ ...bus, baudRate: Number(value) })}
        options={[1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200].map((value) => ({
          id: String(value),
          label: String(value),
        }))}
      />
      <Choice
        label={t('modbus.parity')}
        value={bus.parity}
        onChange={(value) => setBus({ ...bus, parity: value as typeof bus.parity })}
        options={['none', 'even', 'odd'].map((id) => ({ id, label: t(`modbus.options.${id}`) }))}
      />
      <Choice
        label={t('modbus.stopBits')}
        value={String(bus.stopBits)}
        onChange={(value) => setBus({ ...bus, stopBits: Number(value) as 1 | 2 })}
        options={[1, 2].map((value) => ({ id: String(value), label: String(value) }))}
      />
    </SettingsDrawer>
  );
}

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
        <LabeledSwitch isSelected={invert} onChange={setInvert}>
          <Label>{t('panel.invert')}</Label>
        </LabeledSwitch>
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
