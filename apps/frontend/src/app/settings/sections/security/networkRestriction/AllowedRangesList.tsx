import { Description, Tag, TagGroup } from '@heroui/react';
import { useTranslations } from '@attraccess/plugins-frontend-ui';
import en from './en.json';
import de from './de.json';

interface AllowedRangesListProps {
  ranges: readonly string[];
  onRemove: (entry: string) => void;
}

/** The allowed ranges, one removable tag each. */
export function AllowedRangesList({ ranges, onRemove }: Readonly<AllowedRangesListProps>) {
  const { t } = useTranslations({ en, de });
  return (
    <TagGroup
      aria-label={t('ranges.label')}
      onRemove={(keys) => keys.forEach((key) => onRemove(String(key)))}
      data-testid="network-ranges"
    >
      <TagGroup.List renderEmptyState={() => <Description>{t('ranges.empty')}</Description>}>
        {ranges.map((range) => (
          <Tag key={range} id={range} textValue={range}>
            {range}
            <Tag.RemoveButton aria-label={t('ranges.remove', { range })} />
          </Tag>
        ))}
      </TagGroup.List>
    </TagGroup>
  );
}
