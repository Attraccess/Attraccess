import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ResourceVisibilitySetting } from './ResourceVisibilitySetting';

const { mutate, visibility } = vi.hoisted(() => ({
  mutate: vi.fn(),
  visibility: { data: { activityVisibility: 'all' } as { activityVisibility: string } | undefined, isError: false },
}));

vi.mock('@attraccess/react-query-client', () => ({
  ResourceActivityVisibility: { ALL: 'all', INTRODUCED: 'introduced' },
  useSettingsServiceGetResourceVisibilitySettings: () => ({
    data: visibility.data,
    isLoading: false,
    isError: visibility.isError,
  }),
  UseSettingsServiceGetResourceVisibilitySettingsKeyFn: () => ['visibility'],
  useSettingsServiceUpdateResourceVisibilitySettings: () => ({ mutate, isPending: false }),
}));
vi.mock('@attraccess/plugins-frontend-ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/plugins-frontend-ui')>()),
  ...(await (() => ({
    useTranslations: () => ({ t: (key: string) => key, tExists: () => false }),
  }))()),
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ setQueryData: vi.fn() }) }));
vi.mock('../../../../components/toastProvider', () => ({
  useToastMessage: () => ({ success: vi.fn(), apiError: vi.fn() }),
}));

describe('ResourceVisibilitySetting', () => {
  beforeEach(() => {
    mutate.mockClear();
    visibility.data = { activityVisibility: 'all' };
    visibility.isError = false;
  });

  it('shows the current mode and saves a change straight away', async () => {
    render(<ResourceVisibilitySetting />);
    expect(screen.getByText('inputs.activityVisibility.description')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /inputs.activityVisibility.label/ }));
    await userEvent.click(await screen.findByRole('option', { name: 'inputs.activityVisibility.introduced' }));

    expect(mutate).toHaveBeenCalledWith({ requestBody: { activityVisibility: 'introduced' } });
  });

  it('explains what "introduced only" hides', () => {
    visibility.data = { activityVisibility: 'introduced' };
    render(<ResourceVisibilitySetting />);
    expect(screen.getByText('inputs.activityVisibility.introducedHint')).toBeInTheDocument();
  });

  it('disables the control when the setting cannot be loaded', () => {
    visibility.data = undefined;
    visibility.isError = true;
    render(<ResourceVisibilitySetting />);
    expect(screen.getByText('inputs.activityVisibility.loadFailed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /inputs.activityVisibility.label/ })).toBeDisabled();
  });
});
