import { Dispatch, SetStateAction, useState } from 'react';
import { AuditFilters, emptyFilters } from './audit-log-model';

export interface AuditLogFilterState {
  filters: AuditFilters;
  applied: AuditFilters;
  cursors: Array<number | undefined>;
  setCursors: Dispatch<SetStateAction<Array<number | undefined>>>;
  dateFieldResetCount: number;
  filterError: string | undefined;
  setFilterError: (error: string | undefined) => void;
  activeFilterCount: number;
  updateFilter: (key: keyof AuditFilters, value: string) => void;
  applyFilters: () => void;
  clearFilters: () => void;
  filtersOpen: boolean;
  setFiltersOpen: (open: boolean) => void;
  advanced: boolean;
  setAdvanced: (advanced: boolean) => void;
  fromDateValid: boolean;
  setFromDateValid: (valid: boolean) => void;
  toDateValid: boolean;
  setToDateValid: (valid: boolean) => void;
}

/**
 * Shared by the audit filter form (edits the draft), the activity list/pager (reads the applied filters) and the export
 * button. Owned by the section, above the tabs: the form's disclosure and date-validity state lives here too, because
 * the Activity panel unmounts on a tab switch and would otherwise collapse the filters after Settings -> Activity.
 */
export function useAuditLogFilterState(): AuditLogFilterState {
  const [filters, setFilters] = useState<AuditFilters>(emptyFilters);
  const [applied, setApplied] = useState<AuditFilters>(emptyFilters);
  const [cursors, setCursors] = useState<Array<number | undefined>>([undefined]);
  const [filterError, setFilterError] = useState<string>();
  const [dateFieldResetCount, setDateFieldResetCount] = useState(0);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [fromDateValid, setFromDateValid] = useState(true);
  const [toDateValid, setToDateValid] = useState(true);
  const updateFilter = (key: keyof AuditFilters, value: string) =>
    setFilters((current) => ({ ...current, [key]: value }));
  const clearFilters = () => {
    setDateFieldResetCount((count) => count + 1);
    setFilters(emptyFilters);
    setApplied(emptyFilters);
    setCursors([undefined]);
    setFilterError(undefined);
  };
  const applyFilters = () => {
    setFilterError(undefined);
    setApplied({ ...filters });
    setCursors([undefined]);
    setFiltersOpen(false);
  };
  return {
    filters,
    applied,
    cursors,
    setCursors,
    dateFieldResetCount,
    filterError,
    setFilterError,
    activeFilterCount: Object.values(applied).filter(Boolean).length,
    updateFilter,
    applyFilters,
    clearFilters,
    filtersOpen,
    setFiltersOpen,
    advanced,
    setAdvanced,
    fromDateValid,
    setFromDateValid,
    toDateValid,
    setToDateValid,
  };
}
