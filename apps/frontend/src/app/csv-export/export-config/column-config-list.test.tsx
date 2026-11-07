import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ColumnConfigList } from './column-config-list';
import { ConfiguredColumn, MAX_COLUMNS } from './csv';

// 200 real HeroUI selects are far too slow for jsdom; the Select itself is not under test here
vi.mock('../../../components/select', () => ({
  Select: ({ value, 'data-cy': dataCy }: { value?: string; 'data-cy'?: string }) => (
    <span data-cy={dataCy}>{value}</span>
  ),
}));

afterEach(cleanup);

const fields = [
  { key: 'resourceName', label: 'Resource Name' },
  { key: 'username', label: 'User Name' },
];
const t = (key: string, vars?: Record<string, string | number>) => `${key}${vars ? JSON.stringify(vars) : ''}`;
const column = (uid: string, fieldKey: string): ConfiguredColumn => ({ uid, type: 'field', fieldKey, header: '' });

const renderList = (columns: ConfiguredColumn[], extra: Partial<Parameters<typeof ColumnConfigList>[0]> = {}) => {
  const onChange = vi.fn();
  render(<ColumnConfigList columns={columns} fields={fields} onChange={onChange} t={t} {...extra} />);
  return onChange;
};
const unavailable = () => document.querySelectorAll('[data-cy="csv-export-column-unavailable"]');
const apply = (onChange: ReturnType<typeof vi.fn>, columns: ConfiguredColumn[]) => onChange.mock.calls[0][0](columns);

it('flags a field that is missing from the loaded data', () => {
  renderList([column('a', 'resourceName'), column('b', 'resourceMetadata.room')]);
  expect(unavailable()).toHaveLength(1);
});

it('does not flag anything while the data is still loading', () => {
  renderList([column('b', 'resourceMetadata.room')], { checkAvailability: false });
  expect(unavailable()).toHaveLength(0);
});

it('moves and removes columns by identity through functional updates', () => {
  const columns = [column('a', 'resourceName'), column('b', 'username'), column('c', 'resourceName')];

  const moved = renderList(columns);
  fireEvent.click(document.querySelectorAll('[data-cy="csv-export-column-down"]')[0]);
  expect(apply(moved, columns).map((c: ConfiguredColumn) => c.uid)).toEqual(['b', 'a', 'c']);
  cleanup();

  const removed = renderList(columns);
  fireEvent.click(document.querySelectorAll('[data-cy="csv-export-column-remove"]')[1]);
  expect(apply(removed, columns).map((c: ConfiguredColumn) => c.uid)).toEqual(['a', 'c']);
});

it('stops offering to add columns at the limit the API accepts', () => {
  const many = Array.from({ length: MAX_COLUMNS }, (_, index) => column(`c${index}`, 'resourceName'));
  renderList(many);
  expect(document.querySelector('[data-cy="csv-export-add-field"]')).toBeDisabled();
  expect(document.querySelector('[data-cy="csv-export-add-constant"]')).toBeDisabled();
});

it('can still add columns below the limit', () => {
  const onChange = renderList([column('a', 'resourceName')]);
  fireEvent.click(document.querySelector('[data-cy="csv-export-add-constant"]') as HTMLElement);
  expect(apply(onChange, [column('a', 'resourceName')])).toHaveLength(2);
});
