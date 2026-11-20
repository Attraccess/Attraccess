import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SumUpReadersCard } from './index';

const state = vi.hoisted(() => ({
  enabled: true,
  remove: vi.fn(),
  options: undefined as undefined | { onSuccess?: () => void; onError?: (error: Error) => void },
  invalidate: vi.fn(),
  apiError: vi.fn(),
}));

vi.mock('@attraccess/react-query-client', () => ({
  useGetSumUpConfiguration: () => ({ data: { enabled: state.enabled } }),
  useGetSumUpReaders: () => ({
    data: [{ id: 'rdr-1', name: 'Front desk', device: { model: 'solo' }, status: 'paired' }],
  }),
  useGetSumUpReadersKey: 'sumup-readers',
  useRemoveSumUpReader: (_key: unknown, options: typeof state.options) => {
    state.options = options;
    return { mutateAsync: state.remove };
  },
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: state.invalidate }) }));
vi.mock('../../../../../components/toastProvider', () => ({ useToastMessage: () => ({ apiError: state.apiError }) }));
vi.mock('./pairing', () => ({ SumUpReadersPairing: () => null }));

beforeEach(() => {
  vi.clearAllMocks();
  state.enabled = true;
  state.remove.mockResolvedValue(undefined);
});
afterEach(cleanup);

it('renders nothing while SumUp is disabled', () => {
  state.enabled = false;
  const { container } = render(<SumUpReadersCard />, { wrapper: MemoryRouter });
  expect(container).toBeEmptyDOMElement();
});

it('removes a reader after confirmation and refreshes the list', async () => {
  render(<SumUpReadersCard />, { wrapper: MemoryRouter });
  await userEvent.click(screen.getByRole('button', { name: 'Actions for Front desk' }));
  await userEvent.click(within(screen.getByRole('menu')).getByRole('menuitem', { name: 'Delete' }));
  const dialog = await screen.findByRole('alertdialog', { name: 'Delete card reader Front desk?' });
  expect(state.remove).not.toHaveBeenCalled();
  await userEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
  expect(state.remove).toHaveBeenCalledWith({ path: { readerId: 'rdr-1' } });
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());

  act(() => state.options?.onSuccess?.());
  expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ['sumup-readers'] });
  const error = new Error('Refused');
  act(() => state.options?.onError?.(error));
  expect(state.apiError).toHaveBeenCalledWith(expect.objectContaining({ error, baseTranslationKey: 'api' }));
});
