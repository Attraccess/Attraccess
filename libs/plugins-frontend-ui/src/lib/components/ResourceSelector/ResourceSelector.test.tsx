import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ResourceSelector } from './ResourceSelector';
import { useTranslationState } from '../../i18n';
const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('@attraccess/react-query-client', () => ({ useResourcesServiceGetAllResources: mocks.query }));
beforeEach(() => {
  useTranslationState.setState({ language: 'en' });
  mocks.query.mockReturnValue({
    isLoading: false,
    data: {
      data: [
        { id: 1, name: 'Laser' },
        { id: 2, name: 'Printer' },
      ],
    },
  });
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
it('searches resources and reports selected IDs', async () => {
  const user = userEvent.setup();
  const selected = vi.fn();
  render(<ResourceSelector selection={[]} onSelectionChange={selected} />);
  await user.type(screen.getByRole('textbox', { name: 'Search resources' }), 'Laser');
  expect(mocks.query).toHaveBeenLastCalledWith({ limit: 15, page: 1, search: 'Laser' });
  await user.click(screen.getByRole('row', { name: 'Laser' }));
  expect(selected).toHaveBeenLastCalledWith([1]);
});
it('renders an empty loading result safely in single-selection mode', () => {
  mocks.query.mockReturnValue({ isLoading: true, data: undefined });
  render(<ResourceSelector selection={[]} onSelectionChange={vi.fn()} multiple={false} />);
  expect(screen.getByRole('textbox', { name: 'Search resources' })).toBeInTheDocument();
  expect(screen.queryByRole('checkbox', { name: 'Resources' })).not.toBeInTheDocument();
});
