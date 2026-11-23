import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useGetCardWriterSettings, useGetReaders, useUpdateCardWriterSettings } from '@attraccess/react-query-client';
import { AttractapSection } from './index';

vi.mock('@attraccess/react-query-client', () => ({
  useGetCardWriterSettings: vi.fn(),
  UseGetCardWriterSettingsKeyFn: () => ['card-writer-settings'],
  useGetReaders: vi.fn(),
  useUpdateCardWriterSettings: vi.fn(),
  useUpdateUidOnlyCardsSetting: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@attraccess/plugins-frontend-ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/plugins-frontend-ui')>()),
  useTranslations: () => ({ t: (key: string) => key, tExists: () => false }),
}));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ setQueryData: vi.fn() }),
}));
vi.mock('../../../../components/toastProvider', () => ({
  useToastMessage: () => ({ success: vi.fn(), error: vi.fn(), apiError: vi.fn() }),
}));

const save = vi.fn();

const reader = (
  id: number,
  name: string,
  capabilities: Record<string, boolean> = {},
  pairingState: 'paired' | 'revoked' = 'paired',
) => ({
  id,
  name,
  pairingState,
  firmware: { capabilities: { cardEnrollment: true, cardRelay: true, ...capabilities } },
});

const readersQuery = (data: ReturnType<typeof reader>[] | undefined, isLoading = false) =>
  vi.mocked(useGetReaders).mockReturnValue({
    data,
    isLoading,
  } as unknown as ReturnType<typeof useGetReaders>);

const selectedMode = (readerIds: number[]) =>
  vi.mocked(useGetCardWriterSettings).mockReturnValue({
    data: { mode: 'selected', readerIds },
    isLoading: false,
  } as ReturnType<typeof useGetCardWriterSettings>);

describe('AttractapSection (which readers may write cards)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useGetCardWriterSettings).mockReturnValue({
      data: { mode: 'all', readerIds: [] },
      isLoading: false,
    } as ReturnType<typeof useGetCardWriterSettings>);
    readersQuery([reader(1, 'Entrance'), reader(2, 'Workshop')]);
    vi.mocked(useUpdateCardWriterSettings).mockReturnValue({
      mutate: save,
      isPending: false,
    } as unknown as ReturnType<typeof useUpdateCardWriterSettings>);
  });

  it('defaults to all readers and offers nothing to save', () => {
    const view = render(<AttractapSection />);
    expect(screen.getByTestId('card-writer-mode-all')).toBeInTheDocument();
    expect(screen.queryByTestId('card-writer-readers')).toBeNull();
    expect(view.container.querySelector('[data-slot="settings-save-bar"]')).toBeNull();
  });

  it('blocks saving "selected readers" until a reader is picked, then saves the selection', async () => {
    render(<AttractapSection />);
    await userEvent.click(screen.getByRole('radio', { name: /mode.options.selected.label/ }));
    expect(screen.getByText('readers.required')).toBeInTheDocument();
    expect(screen.getByTestId('card-writer-readers')).toHaveAttribute('data-invalid', 'true');
    expect(screen.getByRole('button', { name: 'saveBar.save' })).toBeDisabled();

    await userEvent.click(screen.getByRole('checkbox', { name: 'Workshop' }));
    await userEvent.click(screen.getByRole('button', { name: 'saveBar.save' }));

    expect(save).toHaveBeenCalledWith({ body: { mode: 'selected', readerIds: [2] } });
  });

  it('discards an unsaved choice', async () => {
    const view = render(<AttractapSection />);
    await userEvent.click(screen.getByRole('radio', { name: /mode.options.selected.label/ }));
    await userEvent.click(screen.getByRole('button', { name: 'saveBar.discard' }));
    expect(view.container.querySelector('[data-slot="settings-save-bar"]')).toBeNull();
    expect(screen.queryByTestId('card-writer-readers')).toBeNull();
  });

  it('ignores a deleted reader that is still in the stored list', () => {
    selectedMode([2, 99]);
    const view = render(<AttractapSection />);
    expect(screen.getByRole('checkbox', { name: 'Workshop' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Entrance' })).not.toBeChecked();
    expect(view.container.querySelector('[data-slot="settings-save-bar"]')).toBeNull();
  });

  it('shows a spinner instead of "no readers" while the readers load', () => {
    selectedMode([]);
    readersQuery(undefined, true);
    render(<AttractapSection />);
    expect(screen.getByTestId('card-writer-readers-loading')).toBeInTheDocument();
    expect(screen.queryByText('readers.none')).toBeNull();
  });

  it('says so when there are no readers', () => {
    selectedMode([]);
    readersQuery([]);
    render(<AttractapSection />);
    expect(screen.getByText('readers.none')).toBeInTheDocument();
  });

  it('marks readers that cannot write cards and why', () => {
    selectedMode([1]);
    readersQuery([
      reader(1, 'Entrance'),
      reader(2, 'Old firmware', { cardRelay: false }),
      reader(3, 'No display', { cardEnrollment: false }),
    ]);
    render(<AttractapSection />);
    expect(screen.queryByTestId('card-writer-reader-1-blocker')).toBeNull();
    expect(screen.getByTestId('card-writer-reader-2-blocker')).toHaveTextContent(
      'readers.blockers.firmwareUpdateRequired',
    );
    expect(screen.getByTestId('card-writer-reader-3-blocker')).toHaveTextContent('readers.blockers.noCardEnrollment');
  });

  it('never lists a reader that is not paired, so it cannot be allowed to write cards', () => {
    selectedMode([1]);
    readersQuery([reader(1, 'Front desk'), reader(3, 'Removed', {}, 'revoked')]);
    render(<AttractapSection />);
    expect(screen.getByRole('checkbox', { name: 'Front desk' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Removed' })).toBeNull();
  });
});
