import '@testing-library/jest-dom/vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import type { Resource } from '@attraccess/react-query-client';
import { ResourceSettingsPage } from './ResourceSettingsPage';

const state = vi.hoisted(() => ({
  resource: { id: 1, name: 'Original', type: 'machine' } as Resource,
  mutate: vi.fn(),
  setQueryData: vi.fn(),
  invalidateQueries: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  options: {} as { onSuccess: (resource: Resource) => void },
}));

vi.mock('react-router-dom', () => ({ useParams: () => ({ id: '1' }), Navigate: () => null }));
vi.mock('@attraccess/plugins-frontend-ui', () => ({ useTranslations: () => ({ t: (key: string) => key }) }));
vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ setQueryData: state.setQueryData, invalidateQueries: state.invalidateQueries }),
}));
vi.mock('@attraccess/react-query-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/react-query-client')>()),
  useResourcesServiceGetOneResourceById: () => ({ data: state.resource, isLoading: false, error: null }),
  useResourcesServiceUpdateOneResource: (options: typeof state.options) => {
    state.options = options;
    return { mutate: state.mutate, isPending: false };
  },
}));
vi.mock('../../../components/toastProvider', () => ({
  useToastMessage: () => ({ success: state.success, error: state.error }),
}));
vi.mock('../../../components/pageHeader', () => ({ PageHeader: () => null }));
vi.mock('../../../components/settingsDirectory', () => ({
  SettingsDirectory: ({ groups }: { groups: { items: { key: string; content?: React.ReactNode }[] }[] }) =>
    groups[0].items[0].content,
}));
vi.mock('../editModal/tabs/shared', () => ({
  SharedDataTab: ({
    formData,
    setField,
  }: {
    formData: { name: string };
    setField: (field: 'name', value: string) => void;
  }) => <input aria-label="Name" value={formData.name} onChange={(event) => setField('name', event.target.value)} />,
}));
vi.mock('../editModal/tabs/machine', () => ({ MachineTab: () => null }));
vi.mock('../editModal/tabs/door', () => ({ DoorTab: () => null }));
vi.mock('../editModal/tabs/retraining', () => ({ RetrainingTab: () => null }));
vi.mock('../editModal/tabs/supervision', () => ({ SupervisionTab: () => null }));
vi.mock('../editModal/resourceMetadataEditor', () => ({ ResourceMetadataEditor: () => null }));

beforeEach(() => {
  vi.clearAllMocks();
  state.resource = { id: 1, name: 'Original', type: 'machine' } as Resource;
});

it('keeps edits made during an in-flight save and allows saving them next', () => {
  render(<ResourceSettingsPage />);
  fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Submitted' } });
  fireEvent.click(screen.getByRole('button', { name: 'save' }));
  expect(state.mutate).toHaveBeenCalledWith(
    expect.objectContaining({ formData: expect.objectContaining({ name: 'Submitted' }) }),
  );

  fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Later edit' } });
  act(() => state.options.onSuccess({ ...state.resource, name: 'Submitted' }));
  expect(screen.getByRole('textbox', { name: 'Name' })).toHaveValue('Later edit');
  expect(screen.getByRole('button', { name: 'save' })).toBeEnabled();

  fireEvent.click(screen.getByRole('button', { name: 'save' }));
  expect(state.mutate).toHaveBeenLastCalledWith(
    expect.objectContaining({ formData: expect.objectContaining({ name: 'Later edit' }) }),
  );
});
