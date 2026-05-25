import '@testing-library/jest-dom/vitest';
import { describe, it, expect } from 'vitest';
import { filterAndSortGroups, GroupFilter } from './groupsFilter';

type G = { id: number; name: string };

const groups: G[] = [
  { id: 1, name: 'Bravo' },
  { id: 2, name: 'alpha' },
  { id: 3, name: 'Charlie' },
  { id: 4, name: 'delta' },
];
const assigned = new Set([2, 3]);

describe('filterAndSortGroups', () => {
  it('returns assigned-first, alphabetical within each bucket for filter=all', () => {
    const out = filterAndSortGroups({ groups, assignedIds: assigned, search: '', filter: 'all' });
    expect(out.map((g) => g.id)).toEqual([2, 3, 1, 4]);
  });

  it('returns only assigned, alphabetical for filter=assigned', () => {
    const out = filterAndSortGroups({ groups, assignedIds: assigned, search: '', filter: 'assigned' });
    expect(out.map((g) => g.id)).toEqual([2, 3]);
  });

  it('returns only available, alphabetical for filter=available', () => {
    const out = filterAndSortGroups({ groups, assignedIds: assigned, search: '', filter: 'available' });
    expect(out.map((g) => g.id)).toEqual([1, 4]);
  });

  it('filters by case-insensitive substring search', () => {
    const out = filterAndSortGroups({ groups, assignedIds: assigned, search: 'ph', filter: 'all' });
    expect(out.map((g) => g.id)).toEqual([2]);
  });

  it('applies search then filter (search wins narrowing)', () => {
    const out = filterAndSortGroups({ groups, assignedIds: assigned, search: 'a', filter: 'available' });
    expect(out.map((g) => g.id)).toEqual([1, 4]);
  });

  const allFilters: GroupFilter[] = ['all', 'assigned', 'available'];
  it.each(allFilters)('returns [] when search matches nothing (filter=%s)', (filter) => {
    const out = filterAndSortGroups({ groups, assignedIds: assigned, search: 'zzz', filter });
    expect(out).toEqual([]);
  });
});
