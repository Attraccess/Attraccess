import { Checkbox, Label } from '@heroui/react';
import type { ConfigurationDiff, ConfigurationValidationError, WagoConfigurationSnapshot } from './api';
import { changeLabel, readableChangeValue, readableStructuralChanges, readableValue } from './configuration-model';

export function ConfigurationErrors({
  errors,
  snapshot,
  names,
}: {
  errors: ConfigurationValidationError[];
  snapshot: WagoConfigurationSnapshot;
  names: Record<string, string>;
}) {
  return (
    <ul>
      {errors.map((error) => (
        <li key={error.path + error.code}>
          {changeLabel({ path: error.path, previous: undefined, current: undefined }, snapshot, snapshot, names)}:{' '}
          {Object.entries(names).reduce((message, [id, name]) => message.replaceAll(id, name), error.message)}
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
  const displayed = onSelect ? changes : readableStructuralChanges(changes, before, after);
  if (!displayed.length) return <p>No configuration changes.</p>;
  return (
    <ul className="wg:flex wg:flex-col wg:gap-3">
      {displayed.map((change) => (
        <li key={change.path}>
          {onSelect ? (
            <Checkbox isSelected={selected?.includes(change.path)} onChange={(value) => onSelect(change.path, value)}>
              <Checkbox.Control>
                <Checkbox.Indicator />
              </Checkbox.Control>
              <Checkbox.Content>
                <Label>{changeLabel(change, before, after, names)}</Label>
              </Checkbox.Content>
            </Checkbox>
          ) : (
            <p className="wg:font-medium">{changeLabel(change, before, after, names)}</p>
          )}
          <p className="wg:text-sm">Before: {readableChangeValue(change.path, change.previous, before, names)}</p>
          <p className="wg:text-sm">After: {readableChangeValue(change.path, change.current, after, names)}</p>
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
  if (!changes.length) return null;
  return (
    <section aria-label="Editor metadata changes">
      <h3 className="wg:font-medium">Editor metadata changes</h3>
      <ul className="wg:flex wg:flex-col wg:gap-3">
        {changes.map((change) => (
          <li key={change.path}>
            <p className="wg:font-medium">{metadataChangeLabel(change.path, names)}</p>
            <p className="wg:text-sm">Before: {readableValue(change.previous, names)}</p>
            <p className="wg:text-sm">After: {readableValue(change.current, names)}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function metadataChangeLabel(path: string, names: Record<string, string>) {
  const name = path.match(/^\$\.names\.([^.]*)$/);
  if (name) return `Name for ${names[name[1]] ?? name[1]}`;
  if (/^\$\.presets\[\d+\]/.test(path)) return 'Preset application';
  return 'Editor metadata';
}
