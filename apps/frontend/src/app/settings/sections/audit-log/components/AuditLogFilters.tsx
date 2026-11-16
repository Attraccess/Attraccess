import { useQueryClient } from '@tanstack/react-query';
import { Button, Input, Label, TextField } from '@heroui/react';
import { FilterIcon, RefreshCwIcon, SearchIcon } from 'lucide-react';
import { StatusAlert, useTranslations } from '@attraccess/plugins-frontend-ui';
import { LocaleDateField } from '../../../../../components/localeDateField';
import { coreAuditDomains, filterRequest, pluginDomains } from '../audit-log-model';
import { AuditLogFilterState } from '../useAuditLogFilterState';
import { useAuditDomainLabel } from '../useAuditDomainLabel';
import { useAuditLogMeta } from '../useAuditLogMeta';
import { AuditSelect } from './AuditSelect';
import en from '../en.json';
import de from '../de.json';

interface AuditLogFiltersProps {
  filterState: AuditLogFilterState;
  isRefreshing: boolean;
}

export function AuditLogFilters({ filterState, isRefreshing }: AuditLogFiltersProps) {
  const { t } = useTranslations({ en, de });
  const client = useQueryClient();
  const domainLabel = useAuditDomainLabel();
  const meta = useAuditLogMeta();
  const pluginDomainEntries = pluginDomains(meta.data);
  const {
    filters,
    updateFilter,
    dateFieldResetCount,
    filterError,
    setFilterError,
    activeFilterCount,
    clearFilters,
    setCursors,
    filtersOpen,
    setFiltersOpen,
    advanced,
    setAdvanced,
    fromDateValid,
    setFromDateValid,
    toDateValid,
    setToDateValid,
  } = filterState;
  const applyFilters = () => {
    if (!fromDateValid || !toDateValid) return;
    const result = filterRequest(filters, meta.data?.subjectTypes);
    if (result.error) {
      setFilterError(t(result.error));
      return;
    }
    filterState.applyFilters();
  };
  return (
    <>
      <Button
        className="md:hidden"
        variant="secondary"
        onPress={() => setFiltersOpen(!filtersOpen)}
        aria-expanded={filtersOpen}
      >
        <FilterIcon size={16} />
        {t('filters')}
        {activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
      </Button>
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
          <LocaleDateField
            key={`from-${dateFieldResetCount}`}
            label={t('from')}
            clearLabel={`${t('clearDate')}: ${t('from')}`}
            value={filters.from}
            onChange={(value) => updateFilter('from', value)}
            onValidityChange={setFromDateValid}
            errorMessage={t('invalidDate')}
            withTime
          />
          <LocaleDateField
            key={`to-${dateFieldResetCount}`}
            label={t('to')}
            clearLabel={`${t('clearDate')}: ${t('to')}`}
            value={filters.to}
            onChange={(value) => updateFilter('to', value)}
            onValidityChange={setToDateValid}
            errorMessage={t('invalidDate')}
            withTime
          />
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
        {filterError && <StatusAlert status="danger" title={filterError} />}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="primary" isDisabled={!fromDateValid || !toDateValid}>
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
            isPending={isRefreshing}
            onPress={() => {
              setCursors([undefined]);
              void client.invalidateQueries({ queryKey: ['audit-log'] });
            }}
          >
            <RefreshCwIcon size={16} />
          </Button>
        </div>
      </form>
    </>
  );
}
