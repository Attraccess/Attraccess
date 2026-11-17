import { Button } from '@heroui/react';
import type { ConfigurationEditorMetadata, WagoConfigurationSnapshot } from '../../api/client';
import { useWagoTranslations } from '../../i18n';
import { pointLabel } from '../model';
import { bindModbusPoint, emptyModbus } from '../modbus/modbus-editor';
import { ModbusPointForm } from '../modbus/ModbusPointForm';

export function PhysicalAssignments({
  snapshot,
  metadata,
  onChange,
}: {
  snapshot: WagoConfigurationSnapshot;
  metadata: ConfigurationEditorMetadata;
  onChange: (snapshot: WagoConfigurationSnapshot) => void;
}) {
  const { t } = useWagoTranslations();
  const unused = snapshot.physicalPoints.filter(
    (point) =>
      (point.hardwareProfile === '751-9301' || point.hardwareProfile === 'modbus') &&
      !snapshot.logicalChannels.some((channel) => channel.physicalPointId === point.id),
  );
  if (!unused.length) return null;
  return (
    <section aria-label={t('channels.unusedAssignments')} className="wg:min-w-0">
      <h3>{t('channels.unusedAssignments')}</h3>
      {unused.map((point) => (
        <fieldset key={point.id} className="wg:flex wg:min-w-0 wg:flex-col wg:gap-3">
          <legend className="wg:max-w-full wg:whitespace-normal wg:break-words">
            {pointLabel(point, metadata.names, t)}
          </legend>
          {point.hardwareProfile === 'modbus' && (
            <ModbusPointForm
              configuration={snapshot.modbus ?? emptyModbus}
              value={point.modbus ?? { deviceId: '' }}
              onChange={(binding) => onChange(bindModbusPoint(snapshot, point.id, binding))}
            />
          )}
          <Button
            className="wg:h-auto wg:min-h-10 wg:whitespace-normal wg:py-2"
            variant="secondary"
            onPress={() =>
              onChange({ ...snapshot, physicalPoints: snapshot.physicalPoints.filter((item) => item.id !== point.id) })
            }
          >
            {t('channels.release', { point: pointLabel(point, metadata.names, t) })}
          </Button>
        </fieldset>
      ))}
    </section>
  );
}
