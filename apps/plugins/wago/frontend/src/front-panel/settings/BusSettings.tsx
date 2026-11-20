import { useState } from 'react';
import type { ModbusConnection } from '../../../../modbus/model';
import { OptionSelect } from '../../configuration/channels/OptionSelect';
import { useWagoTranslations } from '../../i18n';
import type { PanelConfiguration } from '../model';
import { busConnection, updateBus } from '../model';
import { SettingsDrawer } from './SettingsDrawer';

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
      <OptionSelect
        label={t('modbus.baud')}
        value={String(bus.baudRate)}
        onChange={(value) => setBus({ ...bus, baudRate: Number(value) })}
        options={[1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200].map((value) => ({
          id: String(value),
          label: String(value),
        }))}
      />
      <OptionSelect
        label={t('modbus.parity')}
        value={bus.parity}
        onChange={(value) => setBus({ ...bus, parity: value as typeof bus.parity })}
        options={['none', 'even', 'odd'].map((id) => ({ id, label: t(`modbus.options.${id}`) }))}
      />
      <OptionSelect
        label={t('modbus.stopBits')}
        value={String(bus.stopBits)}
        onChange={(value) => setBus({ ...bus, stopBits: Number(value) as 1 | 2 })}
        options={[1, 2].map((value) => ({ id: String(value), label: String(value) }))}
      />
    </SettingsDrawer>
  );
}
