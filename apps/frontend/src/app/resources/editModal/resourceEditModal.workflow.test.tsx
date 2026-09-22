import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { type Resource, ResourceType, SupervisionMode, AutoIntroductionTarget } from '@attraccess/react-query-client';
import { ResourceEditModal } from './resourceEditModal';
const state = vi.hoisted(() => ({
  resource: undefined as Resource | undefined,
  create: vi.fn(),
  update: vi.fn(),
  updated: vi.fn(),
  invalidate: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  useful: vi.fn(),
  createOptions: {} as { onSuccess: (resource: Resource) => void; onError: (error: Error) => void },
  updateOptions: {} as { onSuccess: (resource: Resource) => void; onError: (error: Error) => void },
}));
vi.mock('@attraccess/plugins-frontend-ui', () => ({ useTranslations: () => ({ t: (key: string) => key }) }));
vi.mock('../../../components/toastProvider', () => ({
  useToastMessage: () => ({ success: state.success, error: state.error }),
}));
vi.mock('../../../components/DonationPrompt/usefulAction', () => ({ recordUsefulAction: state.useful }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: state.invalidate }) }));
vi.mock('@attraccess/react-query-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/react-query-client')>()),
  useResourcesServiceGetAllResourcesKey: 'resources',
  UseResourcesServiceGetOneResourceByIdKeyFn: ({ id }: { id: number }) => ['resource', id],
  useResourcesServiceGetOneResourceById: () => ({ data: state.resource }),
  useResourcesServiceCreateOneResource: (options: typeof state.createOptions) => {
    state.createOptions = options;
    return { mutate: state.create };
  },
  useResourcesServiceUpdateOneResource: (options: typeof state.updateOptions) => {
    state.updateOptions = options;
    return { mutate: state.update };
  },
}));
vi.mock('./tabs/shared', () => ({
  SharedDataTab: ({
    formData,
    setField,
    onImageSelected,
  }: {
    formData: { name?: string; description?: string };
    setField: (key: 'name' | 'description', value: string) => void;
    onImageSelected: (file: File | null) => void;
  }) => (
    <>
      <input
        aria-label="Resource name"
        required
        value={formData.name}
        onChange={(event) => setField('name', event.target.value)}
      />
      <input
        aria-label="Description"
        value={formData.description}
        onChange={(event) => setField('description', event.target.value)}
      />
      <button type="button" onClick={() => onImageSelected(new File(['image'], 'resource.png', { type: 'image/png' }))}>
        Choose image
      </button>
      <button type="button" onClick={() => onImageSelected(null)}>
        Remove image
      </button>
    </>
  ),
}));
vi.mock('./tabs/machine', () => ({ MachineTab: () => <div>Machine controls</div> }));
vi.mock('./tabs/door', () => ({ DoorTab: () => <div>Door controls</div> }));
vi.mock('./tabs/retraining', () => ({ RetrainingTab: () => <div>Retraining controls</div> }));
vi.mock('./tabs/supervision', () => ({ SupervisionTab: () => <div>Supervision controls</div> }));
vi.mock('./resourceMetadataEditor', () => ({
  ResourceMetadataEditor: ({ value }: { value: Record<string, unknown> }) => <output>{JSON.stringify(value)}</output>,
}));
beforeEach(() => {
  vi.clearAllMocks();
  state.resource = undefined;
  if (!Element.prototype.getAnimations)
    Object.defineProperty(Element.prototype, 'getAnimations', { configurable: true, value: () => [] });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
async function open(resourceId?: number) {
  render(
    <ResourceEditModal resourceId={resourceId} onUpdated={state.updated} closeOnSuccess>
      {(open) => <button onClick={open}>Edit resource</button>}
    </ResourceEditModal>,
  );
  fireEvent.click(screen.getByText('Edit resource'));
  await screen.findByLabelText('Resource name');
}
it('validates and creates a resource with default policies and an image', async () => {
  await open();
  fireEvent.click(screen.getByRole('button', { name: 'buttons.create' }));
  expect(state.create).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Resource name'), { target: { value: 'Laser' } });
  fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Workshop' } });
  fireEvent.click(screen.getByText('Choose image'));
  fireEvent.click(screen.getByRole('button', { name: 'buttons.create' }));
  expect(state.create).toHaveBeenCalledWith({
    formData: {
      name: 'Laser',
      description: 'Workshop',
      type: 'machine',
      allowTakeOver: false,
      image: expect.any(File),
      separateUnlockAndUnlatch: false,
      retrainingMaxAgeDays: null,
      retrainingMaxInactivityDays: null,
      retrainingBlocksAccess: false,
      supervisionMode: 'introduction_required',
      supervisedUsagesUntilIntroduction: null,
      autoIntroductionTarget: null,
      autoIntroductionGroupId: null,
      metadata: {},
    },
  });
  const created = { id: 7, name: 'Laser' } as Resource;
  act(() => state.createOptions.onSuccess(created));
  expect(state.updated).toHaveBeenCalledWith(created);
  expect(state.useful).toHaveBeenCalledOnce();
  expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ['resources'] });
  expect(screen.queryByLabelText('Resource name')).toBeNull();
});
it('loads every policy field and preserves it while editing resource details', async () => {
  const fields = {
    name: 'Door',
    description: 'Front entrance',
    type: ResourceType.DOOR,
    allowTakeOver: true,
    separateUnlockAndUnlatch: true,
    retrainingMaxAgeDays: 90,
    retrainingMaxInactivityDays: 30,
    retrainingBlocksAccess: true,
    supervisionMode: SupervisionMode.INTRODUCTION_REQUIRED,
    supervisedUsagesUntilIntroduction: 3,
    autoIntroductionTarget: AutoIntroductionTarget.RESOURCE,
    autoIntroductionGroupId: 9,
    metadata: { location: 'A1' },
  };
  state.resource = {
    ...fields,
    id: 7,
    createdAt: '2026-09-01',
    updatedAt: '2026-09-01',
    deletedAt: null,
    groups: [],
    forms: [],
  };
  await open(7);
  expect(screen.getByLabelText('Resource name')).toHaveValue('Door');
  expect(screen.getByText('Door controls')).toBeTruthy();
  expect(screen.getByRole('status')).toHaveTextContent('{"location":"A1"}');
  fireEvent.change(screen.getByLabelText('Resource name'), { target: { value: 'Main entrance' } });
  fireEvent.click(screen.getByText('Remove image'));
  fireEvent.click(screen.getByRole('button', { name: 'buttons.update' }));
  expect(state.update).toHaveBeenCalledWith({
    id: 7,
    formData: { ...fields, name: 'Main entrance', image: undefined, deleteImage: true },
  });
  act(() => state.updateOptions.onSuccess(state.resource!));
  expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ['resource', 7] });
  expect(state.updated).toHaveBeenCalledWith(state.resource);
});
it('resets unsaved edits on reopen and shows mutation failures without closing the form', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  await open();
  fireEvent.change(screen.getByLabelText('Resource name'), { target: { value: 'Unsaved' } });
  fireEvent.click(screen.getByRole('button', { name: 'buttons.cancel' }));
  fireEvent.click(screen.getByText('Edit resource'));
  expect(await screen.findByLabelText('Resource name')).toHaveValue('');
  act(() => state.createOptions.onError(new Error('Offline')));
  expect(state.error).toHaveBeenCalledWith({
    title: 'create.error.toast.title',
    description: 'create.error.toast.description Offline',
  });
  act(() => state.updateOptions.onError(new Error('Conflict')));
  expect(state.error).toHaveBeenLastCalledWith({
    title: 'update.error.toast.title',
    description: 'update.error.toast.description Conflict',
  });
  expect(screen.getByRole('button', { name: 'buttons.create' })).toBeTruthy();
  expect(state.updated).not.toHaveBeenCalled();
});
