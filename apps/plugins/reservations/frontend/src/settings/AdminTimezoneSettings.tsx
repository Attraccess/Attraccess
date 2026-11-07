import { Button, StatusDialog } from '@attraccess/plugins-frontend-ui';
import { ListBox, ListBoxItem } from '@heroui/react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { getGlobalSettings, updateGlobalSettings } from '../api';
import { useReservationsTranslations } from '../i18n';
import { describeError } from '../lib/errors';
import { useInvalidateReservations } from '../lib/queries';
import { isValidTimeZone } from '../lib/time';
import { TextInput } from '../shared/fields';

const MAX_LISTED = 200;

function supportedZones(): string[] {
  try {
    return (Intl as unknown as { supportedValuesOf: (key: string) => string[] }).supportedValuesOf('timeZone');
  } catch {
    return ['UTC'];
  }
}

/** `admin.settings` slot: the timezone used for bookable hours, the time grid, mails and iCal. */
export function AdminTimezoneSettings() {
  const { t } = useReservationsTranslations();
  const invalidate = useInvalidateReservations();
  const query = useQuery({ queryKey: ['reservations', 'global-settings'], queryFn: getGlobalSettings, retry: false });
  const [timezone, setTimezone] = useState('');
  const [filter, setFilter] = useState('');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const zones = useMemo(() => {
    const all = supportedZones();
    return all.includes('UTC') ? all : ['UTC', ...all];
  }, []);

  useEffect(() => {
    if (query.data) setTimezone(query.data.timezone);
  }, [query.data]);

  const save = useMutation({
    mutationFn: () => updateGlobalSettings(timezone),
    onSuccess: async () => {
      setSaved(true);
      await invalidate();
      await query.refetch();
    },
    onError: (failure) => setError(describeError(failure, t)),
  });

  const savedZone = query.data?.timezone;
  const allMatches = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const found = needle ? zones.filter((zone) => zone.toLowerCase().includes(needle)) : zones;
    // The saved zone leads the list so the current selection is visible without scrolling.
    return savedZone && found.includes(savedZone) ? [savedZone, ...found.filter((zone) => zone !== savedZone)] : found;
  }, [zones, filter, savedZone]);
  const matches = useMemo(() => allMatches.slice(0, MAX_LISTED), [allMatches]);

  if (query.isError || !query.data) return null;
  const valid = isValidTimeZone(timezone);

  return (
    <div className="rv:flex rv:flex-col rv:gap-3" data-cy="reservations-admin-settings">
      <p className="rv:text-sm rv:text-muted">{t('admin.description')}</p>
      <p className="rv:text-sm">
        {t('admin.current')}: <strong>{timezone}</strong> (
        {t('admin.default', { timezone: query.data.defaultTimezone })})
      </p>
      <TextInput
        label={t('admin.search')}
        value={filter}
        onChange={setFilter}
        placeholder={t('admin.searchPlaceholder')}
        description={
          allMatches.length > matches.length
            ? t('admin.matchesTruncated', { total: allMatches.length, shown: matches.length })
            : t('admin.matches', { count: allMatches.length })
        }
        data-cy="reservations-admin-search"
      />
      <ListBox
        aria-label={t('admin.list')}
        selectionMode="single"
        selectedKeys={new Set([timezone])}
        onSelectionChange={(keys) => {
          const [first] = Array.from(keys as Set<string>);
          if (first) setTimezone(String(first));
        }}
        className="rv:max-h-64 rv:overflow-y-auto"
      >
        {matches.map((zone) => (
          <ListBoxItem key={zone} id={zone} textValue={zone}>
            {zone}
          </ListBoxItem>
        ))}
      </ListBox>
      <div>
        <Button
          variant="primary"
          isDisabled={!valid || timezone === query.data.timezone}
          isPending={save.isPending}
          onPress={() => save.mutate()}
          data-cy="reservations-admin-save"
        >
          {t('common.save')}
        </Button>
      </div>
      <StatusDialog isOpen={saved} onClose={() => setSaved(false)} status="success" title={t('admin.saved')}>
        {t('admin.savedBody', { timezone })}
      </StatusDialog>
      <StatusDialog isOpen={error !== null} onClose={() => setError(null)} status="error" title={t('admin.failed')}>
        {error ?? ''}
      </StatusDialog>
    </div>
  );
}
