import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ResourceGroup } from '@attraccess/react-query-client';
import { ResourceGroupUpsertModal } from './resourceGroupUpsertModal';
const state = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  invalidate: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  createOptions: {} as { onSuccess: (group: ResourceGroup) => void; onError: (error: unknown) => void },
  updateOptions: {} as { onSuccess: (group: ResourceGroup) => void; onError: (error: unknown) => void },
}));
vi.mock('@attraccess/plugins-frontend-ui', () => ({ useTranslations: () => ({ t: (key: string) => key }) }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: state.invalidate }) }));
vi.mock('../../../components/toastProvider', () => ({
  useToastMessage: () => ({ success: state.success, error: state.error }),
}));
vi.mock('@attraccess/react-query-client', () => ({
  useResourcesServiceResourceGroupsGetManyKey: 'groups',
  useResourcesServiceResourceGroupsCreateOne: (options: typeof state.createOptions) => {
    state.createOptions = options;
    return { mutate: state.create, isPending: false };
  },
  useResourcesServiceResourceGroupsUpdateOne: (options: typeof state.updateOptions) => {
    state.updateOptions = options;
    return { mutate: state.update, isPending: false };
  },
}));
beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(cleanup);
async function open(group?: ResourceGroup, onUpserted = vi.fn()) {
  render(
    <ResourceGroupUpsertModal resourceGroup={group} onUpserted={onUpserted}>
      {(onOpen) => <button onClick={onOpen}>Open</button>}
    </ResourceGroupUpsertModal>,
  );
  fireEvent.click(screen.getByText('Open'));
  await screen.findByRole('textbox', { name: 'nameLabel' });
  return onUpserted;
}
it('creates a group with retraining and visibility settings and refreshes the list', async () => {
  const done = await open();
  fireEvent.change(screen.getByRole('textbox', { name: 'nameLabel' }), { target: { value: 'Workshop' } });
  fireEvent.change(screen.getByRole('textbox', { name: 'descriptionLabel' }), { target: { value: 'Shared tools' } });
  fireEvent.change(screen.getByRole('spinbutton', { name: 'retraining.maxAgeDays.label' }), {
    target: { value: '90' },
  });
  fireEvent.change(screen.getByRole('spinbutton', { name: 'retraining.maxInactivityDays.label' }), {
    target: { value: '30' },
  });
  fireEvent.click(screen.getByRole('switch', { name: 'retraining.blocksAccess.label' }));
  fireEvent.click(screen.getByRole('switch', { name: 'visibility.hidden.label' }));
  fireEvent.click(screen.getByRole('button', { name: 'createButton' }));
  expect(state.create).toHaveBeenCalledWith({
    requestBody: {
      name: 'Workshop',
      description: 'Shared tools',
      retrainingMaxAgeDays: 90,
      retrainingMaxInactivityDays: 30,
      retrainingBlocksAccess: true,
      isHidden: true,
    },
  });
  const created = { id: 8, name: 'Workshop' } as ResourceGroup;
  act(() => state.createOptions.onSuccess(created));
  expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ['groups'] });
  expect(done).toHaveBeenCalledWith(created);
  expect(state.success).toHaveBeenCalledWith(expect.objectContaining({ title: 'successTitleCreate' }));
  fireEvent.click(screen.getByText('Open'));
  await waitFor(() => expect(screen.getByRole('textbox', { name: 'nameLabel' })).toHaveValue(''));
});
it('loads an existing group and clears optional limits in an update', async () => {
  await open({
    id: 9,
    name: 'Existing',
    description: null,
    retrainingMaxAgeDays: 100,
    retrainingMaxInactivityDays: 30,
    retrainingBlocksAccess: true,
    isHidden: true,
  } as ResourceGroup);
  expect(screen.getByRole('textbox', { name: 'nameLabel' })).toHaveValue('Existing');
  fireEvent.change(screen.getByRole('spinbutton', { name: 'retraining.maxAgeDays.label' }), { target: { value: '' } });
  fireEvent.change(screen.getByRole('spinbutton', { name: 'retraining.maxInactivityDays.label' }), {
    target: { value: '' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'updateButton' }));
  expect(state.update).toHaveBeenCalledWith({
    id: 9,
    requestBody: expect.objectContaining({
      description: '',
      retrainingMaxAgeDays: null,
      retrainingMaxInactivityDays: null,
    }),
  });
  act(() => state.updateOptions.onSuccess({ id: 9, name: 'Existing' } as ResourceGroup));
  expect(state.success).toHaveBeenCalledWith(expect.objectContaining({ title: 'successTitleUpdate' }));
});
it('shows field validation errors and clears a field error when edited', async () => {
  await open();
  act(() =>
    state.createOptions.onError({
      response: { data: { errors: { name: ['Name already exists'], description: ['Too long'] } } },
    }),
  );
  expect(screen.getByText('Name already exists')).toBeTruthy();
  expect(state.error).toHaveBeenCalledWith({ title: 'errorTitleCreate', description: 'fieldValidationError' });
  fireEvent.change(screen.getByRole('textbox', { name: /nameLabel/ }), { target: { value: 'Unique' } });
  expect(screen.queryByText('Name already exists')).toBeNull();
  fireEvent.change(screen.getByRole('textbox', { name: /descriptionLabel/ }), { target: { value: 'Short' } });
  expect(screen.queryByText('Too long')).toBeNull();
});
it('shows server and fallback failures without closing the editor, then cancels', async () => {
  await open({ id: 9, name: 'Existing' } as ResourceGroup);
  act(() => state.updateOptions.onError({ response: { data: { message: 'Server unavailable' } } }));
  expect(state.error).toHaveBeenLastCalledWith({ title: 'errorTitleUpdate', description: 'Server unavailable' });
  act(() => state.updateOptions.onError({}));
  expect(state.error).toHaveBeenLastCalledWith({ title: 'errorTitleUpdate', description: 'errorDescriptionUpdate' });
  fireEvent.click(screen.getByRole('button', { name: 'cancelButton' }));
  expect(state.update).not.toHaveBeenCalled();
});
