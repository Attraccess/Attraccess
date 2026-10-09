import { Button } from '@heroui/react';
import { Field } from './ConfigurationForm';
import { Choice } from './ConfigurationForm';
import { useModbusConfigurationFormState } from './useModbusConfigurationFormState';
type Model = ReturnType<typeof useModbusConfigurationFormState>;
type Props = Pick<
  Model,
  'focused' | 'section' | 'selectedId' | 'change' | 'value' | 't' | 'showIdentifiers' | 'isDisabled'
>;
export function renderModbusConfigurationFormConnections(
  c: NonNullable<Model['value']>['connections'][number],
  index: number,
  { focused, section, selectedId, change, value, t, showIdentifiers, isDisabled }: Props,
) {
  if (focused && (section !== 'connections' || c.id !== selectedId)) return null;
  const update = (patch: object) =>
    change({
      ...value,
      connections: value.connections.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    });
  return (
    <section key={index} className="wg:flex wg:flex-col wg:gap-3">
      <h3>
        {t('modbus.connectionTitle', {
          index: index + 1,
          address: c.transport === 'tcp' ? c.host || 'TCP' : c.path,
        })}
      </h3>
      <div className="wg:grid wg:gap-3 wg:md:grid-cols-2">
        {showIdentifiers && (
          <Field
            label={t('modbus.connectionId')}
            value={c.id}
            disabled={isDisabled}
            onChange={(id) => update({ id })}
          />
        )}
        <Choice
          label={t('modbus.transport')}
          value={c.transport}
          options={['tcp', 'rtu']}
          disabled={isDisabled}
          onChange={(v) =>
            change({
              ...value,
              connections: value.connections.map((item, i) =>
                i === index
                  ? {
                      id: c.id,
                      timeoutMs: c.timeoutMs,
                      reconnectMs: c.reconnectMs,
                      queueLimit: c.queueLimit,
                      ...(v === 'tcp'
                        ? { transport: 'tcp' as const, host: '', port: 502 }
                        : {
                            transport: 'rtu' as const,
                            path: '/dev/serial',
                            baudRate: 9600,
                            parity: 'even' as const,
                            stopBits: 1 as const,
                          }),
                    }
                  : item,
              ),
            })
          }
        />
        {c.transport === 'tcp' ? (
          <>
            <Field
              label={t('modbus.host')}
              value={c.host}
              disabled={isDisabled}
              onChange={(host) => update({ host })}
            />
            <Field
              label={t('modbus.port')}
              value={c.port}
              numeric
              disabled={isDisabled}
              onChange={(v) => update({ port: Number(v) })}
            />
          </>
        ) : (
          <>
            <p className="wg:text-sm wg:text-muted">{t('modbus.serialHint')}</p>
            <Field
              label={t('modbus.path')}
              value={c.path}
              disabled={isDisabled}
              onChange={(path) => update({ path })}
            />
            <Choice
              label={t('modbus.baud')}
              value={c.baudRate}
              options={[1200, 2400, 4800, 9600, 19200, 38400, 57600, 115200]}
              disabled={isDisabled}
              onChange={(v) => update({ baudRate: Number(v) })}
            />
            <Choice
              label={t('modbus.parity')}
              value={c.parity}
              options={['none', 'even', 'odd']}
              disabled={isDisabled}
              onChange={(parity) => update({ parity })}
            />
            <Choice
              label={t('modbus.stopBits')}
              value={c.stopBits}
              options={[1, 2]}
              disabled={isDisabled}
              onChange={(v) => update({ stopBits: Number(v) })}
            />
          </>
        )}
        {(['timeoutMs', 'reconnectMs', 'queueLimit'] as const).map((key) => (
          <Field
            key={key}
            label={t(`modbus.${key}`)}
            value={c[key]}
            numeric
            disabled={isDisabled}
            onChange={(v) => update({ [key]: Number(v) })}
          />
        ))}
        <Button
          isDisabled={isDisabled}
          variant="danger"
          onPress={() => change({ ...value, connections: value.connections.filter((_, i) => i !== index) })}
        >
          {t('modbus.removeConnection')}
        </Button>
      </div>
    </section>
  );
}
