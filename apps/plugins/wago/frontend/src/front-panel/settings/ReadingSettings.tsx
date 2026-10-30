// Chooses which readings of a device's Modbus map the controller polls and publishes.
// FEATURE: WAGO front panel enables meter readings per register within the enabled-channel limit.
import { LabeledSwitch } from '@attraccess/plugins-frontend-ui';
import { Accordion, Button } from '@heroui/react';
import { useId } from 'react';
import type { ModbusMeasurement, ModbusProfile } from '../../../../modbus/model';
import { useWagoTranslations } from '../../i18n';
import type { ChannelEnabledSupport } from '../model';

const HINT: Record<ChannelEnabledSupport, string> = {
  supported: 'panel.readings.hint',
  unsupported: 'panel.readings.unsupported',
  checking: 'panel.readings.checking',
  unknown: 'panel.readings.unknown',
};

/** Over the limit, only a runtime that can disable channels lets the operator disable readings. */
const OVER_LIMIT: Record<ChannelEnabledSupport, string> = {
  supported: 'panel.readings.countOver',
  unsupported: 'panel.readings.countOverUnsupported',
  checking: 'panel.readings.countOverChecking',
  unknown: 'panel.readings.countOverChecking',
};

export function ReadingSettings({
  profile,
  translateNames,
  disabledReadings,
  recommended,
  required = new Map(),
  count,
  support,
  onChange,
  onRecommended,
  onUnused,
}: {
  profile: ModbusProfile;
  /** Built-in register names are catalog keys; custom names are operator text. */
  translateNames: boolean;
  disabledReadings: ReadonlySet<string>;
  recommended?: ReadonlySet<string>;
  /** Readings a guard or feedback uses, with the names of those channels; they cannot be disabled. */
  required?: ReadonlyMap<string, readonly string[]>;
  count: { enabled: number; max: number };
  support: ChannelEnabledSupport;
  onChange: (ids: readonly string[], enabled: boolean) => void;
  onRecommended: () => void;
  onUnused: () => void;
}) {
  const { t, tBackendMessage } = useWagoTranslations();
  const idBase = useId();
  const disabledChannels = support === 'supported';
  const sections = new Map<string, ModbusMeasurement[]>();
  for (const register of profile.measurements) {
    const key = register.section ?? 'electrical';
    sections.set(key, [...(sections.get(key) ?? []), register]);
  }
  const over = count.enabled > count.max;
  const index = new Map(profile.measurements.map((register, position) => [register.id, position] as const));
  return (
    <section aria-label={t('panel.readings.title')} className="wg:flex wg:flex-col wg:gap-3">
      <div className="wg:flex wg:flex-wrap wg:items-center wg:justify-between wg:gap-2">
        <p role="status" className={`wg:text-sm ${over ? 'wg:text-danger' : 'wg:text-muted'}`}>
          {t(over ? OVER_LIMIT[support] : 'panel.readings.count', count)}
        </p>
        <Button
          size="sm"
          variant="secondary"
          isDisabled={!disabledChannels}
          onPress={recommended ? onRecommended : onUnused}
        >
          {t(recommended ? 'panel.readings.recommendedOnly' : 'panel.readings.unusedOnly')}
        </Button>
      </div>
      <p className="wg:text-sm wg:text-muted">{t(HINT[support])}</p>
      <Accordion allowsMultipleExpanded defaultExpandedKeys={['electrical']}>
        {[...sections].map(([section, registers]) => {
          const ids = registers.map((register) => register.id);
          const enabled = ids.filter((id) => !disabledReadings.has(id)).length;
          // Readings a guard or feedback uses stay on, so "Disable section" only has the others to switch.
          const disableable = ids.filter((id) => !disabledReadings.has(id) && !required.has(id)).length;
          const sectionName = t(`panel.sections.${section}`);
          return (
            <Accordion.Item key={section} id={section}>
              <Accordion.Heading>
                <Accordion.Trigger>
                  {t('panel.readings.section', { section: sectionName, enabled, total: ids.length })}
                  <Accordion.Indicator />
                </Accordion.Trigger>
              </Accordion.Heading>
              <Accordion.Panel>
                <Accordion.Body className="wg:flex wg:flex-col wg:gap-3">
                  {disabledChannels && (
                    <div className="wg:flex wg:flex-wrap wg:gap-2">
                      <Button
                        size="sm"
                        variant="secondary"
                        aria-label={t('panel.readings.enableSectionNamed', { section: sectionName })}
                        isDisabled={enabled === ids.length}
                        onPress={() => onChange(ids, true)}
                      >
                        {t('panel.readings.enableSection')}
                      </Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        aria-label={t('panel.readings.disableSectionNamed', { section: sectionName })}
                        isDisabled={!disableable}
                        onPress={() => onChange(ids, false)}
                      >
                        {t('panel.readings.disableSection')}
                      </Button>
                    </div>
                  )}
                  {registers.map((register) => {
                    const name = translateNames ? tBackendMessage(register.name) : register.name || register.id;
                    const on = !disabledReadings.has(register.id);
                    const users = required.get(register.id);
                    const detailsId = `${idBase}-${index.get(register.id)}`;
                    const lockId = `${detailsId}-required`;
                    return (
                      <div key={register.id} className="wg:flex wg:flex-col wg:gap-1">
                        <LabeledSwitch
                          aria-label={name}
                          aria-describedby={users ? `${detailsId} ${lockId}` : detailsId}
                          isSelected={on}
                          // A reading a guard or feedback uses can be switched on, never off.
                          isDisabled={!disabledChannels || (on && Boolean(users))}
                          onChange={(value) => onChange([register.id], value)}
                        >
                          <span className="wg:flex wg:min-w-0 wg:flex-col wg:text-sm">
                            <span className="wg:break-words">{name}</span>
                            <span id={detailsId} className="wg:text-xs wg:text-muted">
                              0x{register.address.toString(16)} · {register.dataType} ·{' '}
                              {t(`modbus.options.${register.unit}`)}
                            </span>
                          </span>
                        </LabeledSwitch>
                        {users && (
                          <p id={lockId} className="wg:text-xs wg:text-muted">
                            {t('panel.readings.required', { outputs: users.join(', ') })}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </Accordion.Body>
              </Accordion.Panel>
            </Accordion.Item>
          );
        })}
      </Accordion>
    </section>
  );
}
