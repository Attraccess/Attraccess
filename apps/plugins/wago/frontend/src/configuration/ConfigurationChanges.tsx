import { Checkbox } from '@heroui/react';
import { useWagoTranslations } from '../i18n';
import type { TFunction } from '@attraccess/plugins-frontend-ui';
import type { ConfigurationDiff, ConfigurationValidationError, WagoConfigurationSnapshot } from '../api/client';
import {
  configurationNames,
  changeLabel,
  readableChangeValue,
  readableStructuralChanges,
  readableValue,
} from './model';

export function ConfigurationErrors({
  errors,
  snapshot,
  names,
}: {
  errors: ConfigurationValidationError[];
  snapshot: WagoConfigurationSnapshot;
  names: Record<string, string>;
}) {
  const { t, tBackendMessage, tValidationMessage } = useWagoTranslations();
  const labels = configurationNames(snapshot, names, t, tBackendMessage);
  return (
    <ul>
      {errors.map((error, index) => (
        <li key={error.path + error.code + index}>
          {changeLabel({ path: error.path, previous: undefined, current: undefined }, snapshot, snapshot, labels, t)}:{' '}
          {tValidationMessage(error.message, names)}
        </li>
      ))}
    </ul>
  );
}

export function ConfigurationChanges({
  changes,
  before,
  after,
  names,
  selected,
  onSelect,
}: {
  changes: ConfigurationDiff[];
  before: WagoConfigurationSnapshot | null;
  after: WagoConfigurationSnapshot;
  names: Record<string, string>;
  selected?: string[];
  onSelect?: (path: string, selected: boolean) => void;
}) {
  const { t, tBackendMessage } = useWagoTranslations();
  const valueOptions = { translateName: tBackendMessage, metadataNames: names };
  names = configurationNames(after, configurationNames(before, names, t, tBackendMessage), t, tBackendMessage);
  const displayed = onSelect ? changes : readableStructuralChanges(changes, before, after);
  if (!displayed.length) return <p>{t('configuration.empty')}</p>;
  return (
    <ul className="wg:flex wg:flex-col wg:gap-3">
      {displayed.map((change) => (
        <li key={change.path}>
          {onSelect ? (
            <Checkbox isSelected={selected?.includes(change.path)} onChange={(value) => onSelect(change.path, value)}>
              <Checkbox.Content className="wg:items-start">
                <Checkbox.Control className="wg:mt-0.5">
                  <Checkbox.Indicator />
                </Checkbox.Control>
                {changeLabel(change, before, after, names, t)}
              </Checkbox.Content>
            </Checkbox>
          ) : (
            <p className="wg:font-medium">{changeLabel(change, before, after, names, t)}</p>
          )}
          <p className="wg:text-sm">
            {t('configuration.before')}{' '}
            {readableChangeValue(change.path, change.previous, before, names, t, valueOptions)}
          </p>
          <p className="wg:text-sm">
            {t('configuration.after')} {readableChangeValue(change.path, change.current, after, names, t, valueOptions)}
          </p>
        </li>
      ))}
    </ul>
  );
}

export function ConfigurationMetadataChanges({
  changes,
  names,
}: {
  changes: ConfigurationDiff[];
  names: Record<string, string>;
}) {
  const { t } = useWagoTranslations();
  if (!changes.length) return null;
  return (
    <section aria-label={t('configuration.metadata')}>
      <h3 className="wg:font-medium">{t('configuration.metadata')}</h3>
      <ul className="wg:flex wg:flex-col wg:gap-3">
        {changes.map((change) => (
          <li key={change.path}>
            <p className="wg:font-medium">{metadataChangeLabel(change.path, names, t)}</p>
            <p className="wg:text-sm">
              {t('configuration.before')} {readableMetadataValue(change.path, change.previous, names, t)}
            </p>
            <p className="wg:text-sm">
              {t('configuration.after')} {readableMetadataValue(change.path, change.current, names, t)}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function readableMetadataValue(path: string, value: unknown, names: Record<string, string>, t: TFunction) {
  if (path.startsWith('$.names.') && typeof value === 'string') return value;
  const field =
    path
      .split('.')
      .at(-1)
      ?.replace(/\[\d+\]$/, '') ?? '';
  return readableValue(value, names, t, field);
}

function metadataChangeLabel(path: string, names: Record<string, string>, t: TFunction) {
  const name = path.match(/^\$\.names\.([^.]*)$/);
  if (name) return t('configuration.nameFor', { name: names[name[1]] ?? name[1] });
  if (/^\$\.presets\[\d+\]/.test(path)) return t('configuration.presetApplication');
  return t('configuration.metadata');
}
