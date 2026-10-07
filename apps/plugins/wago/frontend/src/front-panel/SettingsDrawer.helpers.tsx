import { useState } from 'react';
import type { ModbusConnection } from '../../../modbus/model';
import { Choice } from '../DigitalChannelEditor';
import { useWagoTranslations } from '../i18n';
import { busConnection } from './model';
import { updateBus } from './model';
import type { PanelConfiguration } from './model';
import { Button } from '@heroui/react';
import { Drawer } from '@heroui/react';
import { Form } from '@heroui/react';
import type { ReactNode } from 'react';

export function SettingsDrawer({
  title,
  onClose,
  onSave,
  children,
  remove,
}: {
  title: string;
  onClose: () => void;
  onSave: () => void;
  children: ReactNode;
  remove?: ReactNode;
}) {
  const { t } = useWagoTranslations();
  return (
    <Drawer.Backdrop isOpen onOpenChange={(open) => !open && onClose()}>
      <Drawer.Content placement="right">
        <Drawer.Dialog
          aria-label={title}
          className="wg:w-full wg:max-w-full wg:sm:max-w-xl wg:bg-surface-secondary"
          style={{ '--field-border': 'var(--border-secondary)', '--border-width-field': '1px' } as React.CSSProperties}
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
              <Button type="submit">{t('panel.done')}</Button>
            </Drawer.Footer>
          </Form>
        </Drawer.Dialog>
      </Drawer.Content>
    </Drawer.Backdrop>
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
