// Preset shortcut button row for CSV export date range
// FEATURE: CSV export — quick presets like Today, Last 7 days, This Month
import { Button } from '@heroui/react';
import { Preset, PRESET_ORDER } from './compute-range';

interface Props {
  value: Preset;
  onChange: (next: Preset) => void;
  t: (key: string) => string;
}

export function PresetChips(props: Props) {
  const { value, onChange, t } = props;

  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={t('steps.range.title')}>
      {PRESET_ORDER.map((preset) => {
        const isActive = value === preset;
        return (
          <Button
            key={preset}
            size="sm"
            variant={isActive ? 'primary' : 'outline'}
            onPress={() => onChange(preset)}
            data-cy={`csv-export-preset-${preset}`}
            aria-pressed={isActive}
          >
            {t(`presets.${preset}`)}
          </Button>
        );
      })}
    </div>
  );
}
