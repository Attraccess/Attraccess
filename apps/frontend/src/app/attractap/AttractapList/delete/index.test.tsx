import '@testing-library/jest-dom/vitest';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { AttractapDeleteModal } from './index';

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
  deleteOptions: { current: undefined as undefined | { onSuccess?: () => void } },
  invalidateQueries: vi.fn(),
}));

vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }) }));
vi.mock('@attraccess/react-query-client', () => ({
  useAttractapServiceDeleteReader: (options: { onSuccess?: () => void }) => {
    mocks.deleteOptions.current = options;
    return { mutate: mocks.mutate, isPending: false };
  },
  UseAttractapServiceGetReadersKeyFn: () => ['readers'],
  UseAttractapServiceGetReadersToPairKeyFn: () => ['readers-to-pair'],
}));
vi.mock('@attraccess/plugins-frontend-ui', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useTranslations: () => ({ t: (key: string) => key }),
  DeleteConfirmationModal: ({ isOpen, onConfirm }: { isOpen: boolean; onConfirm: () => void }) =>
    isOpen ? <button onClick={onConfirm}>confirm</button> : null,
}));

beforeEach(() => {
  mocks.mutate.mockClear();
  mocks.invalidateQueries.mockClear();
});

// A record can be deleted from the paired list or from the one under Not paired.
it('deletes the reader and refreshes both reader lists', async () => {
  render(<AttractapDeleteModal readerId={4}>{(open) => <button onClick={open}>delete</button>}</AttractapDeleteModal>);
  await userEvent.click(screen.getByRole('button', { name: 'delete' }));
  await userEvent.click(screen.getByRole('button', { name: 'confirm' }));
  expect(mocks.mutate).toHaveBeenCalledWith({ readerId: 4 });

  act(() => mocks.deleteOptions.current?.onSuccess?.());
  expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['readers'] });
  expect(mocks.invalidateQueries).toHaveBeenCalledWith({ queryKey: ['readers-to-pair'] });
});
