import { Button, Input, Label, TextField } from '@heroui/react';
import { FilterIcon, RefreshCwIcon, SearchIcon } from 'lucide-react';
import { coreAuditDomains } from '../audit-log-model';
import { Notice } from './AuditLogPanels';
import { AuditSelect } from './AuditLogPanels';
import { useAuditLogSectionState } from './AuditLogPanels';
type Props = Pick<
  ReturnType<typeof useAuditLogSectionState>,
  | 'filtersOpen'
  | 'applyFilters'
  | 't'
  | 'filters'
  | 'updateFilter'
  | 'domainLabel'
  | 'pluginDomainEntries'
  | 'advanced'
  | 'filterError'
  | 'setAdvanced'
  | 'activeFilterCount'
  | 'clearFilters'
  | 'activity'
  | 'setCursors'
  | 'client'
>;
export function AuditLogFilters({
  filtersOpen,
  applyFilters,
  t,
  filters,
  updateFilter,
  domainLabel,
  pluginDomainEntries,
  advanced,
  filterError,
  setAdvanced,
  activeFilterCount,
  clearFilters,
  activity,
  setCursors,
  client,
}: Props) {
  return (
    <form
      className={`space-y-4 ${filtersOpen ? '' : 'hidden md:block'}`}
      onSubmit={(event) => {
        event.preventDefault();
        applyFilters();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
        <AuditSelect
          label={t('domain')}
          value={filters.domain}
          onChange={(value) => updateFilter('domain', value)}
          options={[
            { value: '', label: t('allDomains') },
            ...coreAuditDomains.map((domain) => ({ value: domain, label: domainLabel(domain) })),
            ...pluginDomainEntries.map((domain) => ({ value: domain.id, label: domainLabel(domain.id) })),
          ]}
        />
        <TextField value={filters.eventPrefix} onChange={(value) => updateFilter('eventPrefix', value)}>
          <Label>{t('event')}</Label>
          <Input placeholder={t('eventPlaceholder')} />
        </TextField>
        <TextField value={filters.from} onChange={(value) => updateFilter('from', value)} type="datetime-local">
          <Label>{t('from')}</Label>
          <Input />
        </TextField>
        <TextField value={filters.to} onChange={(value) => updateFilter('to', value)} type="datetime-local">
          <Label>{t('to')}</Label>
          <Input />
        </TextField>
      </div>
      {advanced && (
        <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-4">
          <TextField value={filters.actorId} onChange={(value) => updateFilter('actorId', value)}>
            <Label>{t('actorId')}</Label>
            <Input inputMode="numeric" placeholder={t('anyId')} />
          </TextField>
          <TextField value={filters.subjectId} onChange={(value) => updateFilter('subjectId', value)}>
            <Label>{t('targetId')}</Label>
            <Input inputMode="numeric" placeholder={t('anyId')} />
          </TextField>
          <TextField value={filters.subjectType} onChange={(value) => updateFilter('subjectType', value)}>
            <Label>{t('targetType')}</Label>
            <Input placeholder={t('targetTypePlaceholder')} />
          </TextField>
          <AuditSelect
            label={t('outcome')}
            value={filters.outcome}
            onChange={(value) => updateFilter('outcome', value)}
            options={[
              { value: '', label: t('allOutcomes') },
              ...['succeeded', 'failed', 'attempted'].map((value) => ({ value, label: t(`outcomes.${value}`) })),
            ]}
          />
        </div>
      )}
      {filterError && <Notice title={filterError} />}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="primary">
          <SearchIcon size={16} />
          {t('search')}
        </Button>
        <Button variant="ghost" onPress={() => setAdvanced(!advanced)} aria-expanded={advanced}>
          <FilterIcon size={16} />
          {t(advanced ? 'fewerFilters' : 'moreFilters')}
        </Button>
        {activeFilterCount > 0 && (
          <Button variant="ghost" onPress={clearFilters}>
            {t('clear')} ({activeFilterCount})
          </Button>
        )}
        <Button
          className="ml-auto"
          variant="ghost"
          aria-label={t('refresh')}
          isIconOnly
          isPending={activity.isFetching}
          onPress={() => {
            setCursors([undefined]);
            void client.invalidateQueries({ queryKey: ['audit-log'] });
          }}
        >
          <RefreshCwIcon size={16} />
        </Button>
      </div>
    </form>
  );
}
