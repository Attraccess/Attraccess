import { Button } from '@heroui/react';
import { PlusIcon } from 'lucide-react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import { RangeSuggestionGroup } from './rangeSuggestions';
import en from './en.json';
import de from './de.json';

interface RangeSuggestionsProps {
  groups: RangeSuggestionGroup[];
  onAdd: (entries: string[]) => void;
}

/** Quick-add buttons for suggested ranges, grouped by where the suggestion comes from. */
export function RangeSuggestions({ groups, onAdd }: Readonly<RangeSuggestionsProps>) {
  const { t } = useTranslations({ en, de });
  if (groups.length === 0) return null;
  return (
    <div className="flex flex-col gap-2" data-testid="network-range-suggestions">
      {groups.map((group) => (
        <div key={group.key} className="flex flex-col gap-1">
          <span className="text-xs text-muted">{t(`suggestions.${group.key}`)}</span>
          <div className="flex flex-wrap gap-2">
            {group.ranges.map((range) => (
              <Button
                key={range}
                size="sm"
                variant="outline"
                onPress={() => onAdd([range])}
                aria-label={t('suggestions.add', { range })}
              >
                <PlusIcon className="h-3 w-3" />
                {range}
              </Button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
