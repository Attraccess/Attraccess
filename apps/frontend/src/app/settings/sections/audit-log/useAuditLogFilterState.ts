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
}

/** Shared by the audit filter form (edits the draft), the activity list/pager (reads the applied filters) and the export button. */
export function useAuditLogFilterState(): AuditLogFilterState {
  const [filters, setFilters] = useState<AuditFilters>(emptyFilters);
  const [applied, setApplied] = useState<AuditFilters>(emptyFilters);
  const [cursors, setCursors] = useState<Array<number | undefined>>([undefined]);
  const [filterError, setFilterError] = useState<string>();
  const [dateFieldResetCount, setDateFieldResetCount] = useState(0);
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
  };
}
