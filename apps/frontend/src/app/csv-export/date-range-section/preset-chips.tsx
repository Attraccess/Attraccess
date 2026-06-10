// Preset shortcut toggle group for CSV export date range
// FEATURE: CSV export — quick presets like Today, Last 7 days, This Month
import { ToggleButton, ToggleButtonGroup } from '@heroui/react';
import { Preset, PRESET_ORDER } from './compute-range';

interface Props {
  value: Preset;
  onChange: (next: Preset) => void;
  t: (key: string) => string;
}

export function PresetChips(props: Props) {
  const { value, onChange, t } = props;

  return (
    <ToggleButtonGroup
      aria-label={t('steps.range.title')}
      selectionMode="single"
      disallowEmptySelection
      selectedKeys={[value]}
      onSelectionChange={(keys) => {
        const next = [...keys][0] as Preset | undefined;
        if (next) onChange(next);
      }}
      size="sm"
      isDetached
      className="flex-wrap"
    >
      {PRESET_ORDER.map((preset) => (
        <ToggleButton key={preset} id={preset} data-cy={`csv-export-preset-${preset}`}>
          {t(`presets.${preset}`)}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}
