import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useGetCardWriterSettings, useUpdateCardWriterSettings } from '@attraccess/react-query-client';
import { UidOnlyCardsSetting } from './UidOnlyCardsSetting';

vi.mock('@attraccess/react-query-client', () => ({
  useGetCardWriterSettings: vi.fn(),
  UseGetCardWriterSettingsKeyFn: () => ['card-writer-settings'],
  useUpdateCardWriterSettings: vi.fn(),
}));
vi.mock('@attraccess/plugins-frontend-ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/plugins-frontend-ui')>()),
  useTranslations: () => ({ t: (key: string) => key, tExists: () => false }),
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ setQueryData: vi.fn() }) }));
vi.mock('../../../../components/toastProvider', () => ({
  useToastMessage: () => ({ success: vi.fn(), error: vi.fn(), apiError: vi.fn() }),
}));

const save = vi.fn();
const settings = (allowUidOnlyCards?: boolean) =>
  vi.mocked(useGetCardWriterSettings).mockReturnValue({
    data: { mode: 'selected', readerIds: [3], ...(allowUidOnlyCards === undefined ? {} : { allowUidOnlyCards }) },
  } as ReturnType<typeof useGetCardWriterSettings>);

beforeEach(() => {
  vi.clearAllMocks();
  save.mockResolvedValue(undefined);
  vi.mocked(useUpdateCardWriterSettings).mockReturnValue({
    mutateAsync: save,
    isPending: false,
  } as unknown as ReturnType<typeof useUpdateCardWriterSettings>);
});
afterEach(cleanup);

describe('UidOnlyCardsSetting (dangerous, off by default)', () => {
  it('is off when the server does not say otherwise, and warns about the risk', () => {
    settings(undefined);
    render(<UidOnlyCardsSetting />);
    expect(screen.getByRole('switch')).not.toBeChecked();
    expect(screen.getByText('uidOnly.warning')).toBeInTheDocument();
    expect(screen.getByText('uidOnly.offNote')).toBeInTheDocument();
  });

  it('saves nothing until the warning is confirmed, and keeps the reader settings as they were', async () => {
    settings(false);
    render(<UidOnlyCardsSetting />);

    await userEvent.click(screen.getByRole('switch'));
    const dialog = await screen.findByRole('alertdialog', { name: 'uidOnly.confirm.title' });
    expect(screen.getByText('uidOnly.confirm.message')).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();

    await userEvent.click(dialog.querySelector('[data-cy="uid-only-cards-confirm"]') as HTMLElement);
    expect(save).toHaveBeenCalledWith({ body: { mode: 'selected', readerIds: [3], allowUidOnlyCards: true } });
  });

  it('saves nothing when the warning is cancelled', async () => {
    settings(false);
    render(<UidOnlyCardsSetting />);
    await userEvent.click(screen.getByRole('switch'));
    await userEvent.click(await screen.findByRole('button', { name: 'uidOnly.confirm.cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(save).not.toHaveBeenCalled();
  });

  it('turns off without a confirmation', async () => {
    settings(true);
    render(<UidOnlyCardsSetting />);
    expect(screen.getByRole('switch')).toBeChecked();
    expect(screen.queryByText('uidOnly.offNote')).toBeNull();

    await userEvent.click(screen.getByRole('switch'));

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(save).toHaveBeenCalledWith({ body: { mode: 'selected', readerIds: [3], allowUidOnlyCards: false } });
  });

  it('renders nothing before the settings are loaded', () => {
    vi.mocked(useGetCardWriterSettings).mockReturnValue({ data: undefined } as ReturnType<
      typeof useGetCardWriterSettings
    >);
    const view = render(<UidOnlyCardsSetting />);
    expect(view.container).toBeEmptyDOMElement();
  });
});
