import {
  Label,
  ListBox,
  ListBoxItem,
  Select,
  SelectIndicator,
  SelectPopover,
  SelectTrigger,
  SelectValue,
  Switch,
} from '@heroui/react';
import { useMatterTranslations } from '../i18n';
import type { LifecycleState } from './api';

/** `active`: unclaimed, claimed and detached (all of them, unless archived and removed are included). */
export type LifecycleFilterValue = 'active' | LifecycleState;

const ACTIVE_OPTIONS: LifecycleFilterValue[] = ['active', 'unclaimed', 'claimed', 'detached'];
const ALL_OPTIONS: LifecycleFilterValue[] = [...ACTIVE_OPTIONS, 'archived', 'removed'];

export const matchesFilter = (
  state: LifecycleState,
  filter: LifecycleFilterValue,
  includeInactive: boolean,
): boolean => {
  if (filter === 'active') return includeInactive || (state !== 'archived' && state !== 'removed');
  return state === filter;
};

/** The lifecycle filter (defaults to the active states) and the toggle that includes archived and removed devices. */
export function LifecycleFilter({
  value,
  includeInactive,
  onChange,
  onIncludeInactiveChange,
}: Readonly<{
  value: LifecycleFilterValue;
  includeInactive: boolean;
  onChange: (value: LifecycleFilterValue) => void;
  onIncludeInactiveChange: (include: boolean) => void;
}>) {
  const { t } = useMatterTranslations();
  const options = includeInactive ? ALL_OPTIONS : ACTIVE_OPTIONS;
  return (
    <div className="mt:flex mt:flex-wrap mt:items-end mt:gap-4">
      <Select
        value={options.includes(value) ? value : 'active'}
        onChange={(key) => onChange(String(key) as LifecycleFilterValue)}
        className="mt:w-full mt:sm:w-56"
        data-cy="matter-lifecycle-filter"
      >
        <Label>{t('devices.filter.label')}</Label>
        <SelectTrigger>
          <SelectValue />
          <SelectIndicator />
        </SelectTrigger>
        <SelectPopover>
          <ListBox>
            {options.map((option) => (
              <ListBoxItem key={option} id={option} textValue={t(`devices.filter.${option}`)}>
                {t(`devices.filter.${option}`)}
              </ListBoxItem>
            ))}
          </ListBox>
        </SelectPopover>
      </Select>
      <Switch isSelected={includeInactive} onChange={onIncludeInactiveChange} data-cy="matter-include-inactive">
        <Switch.Control>
          <Switch.Thumb />
        </Switch.Control>
        <Switch.Content>{t('devices.filter.includeInactive')}</Switch.Content>
      </Switch>
    </div>
  );
}
