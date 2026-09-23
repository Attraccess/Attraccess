import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { Resource } from '@attraccess/react-query-client';
import { CreateResourceDrawer } from './createResourceDrawer';

const state = vi.hoisted(() => ({
  create: vi.fn(),
  navigate: vi.fn(),
  invalidate: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  useful: vi.fn(),
  createOptions: {} as { onSuccess: (resource: Resource) => void; onError: (error: Error) => void },
}));

vi.mock('@attraccess/plugins-frontend-ui', () => ({ useTranslations: () => ({ t: (key: string) => key }) }));
vi.mock('react-router-dom', () => ({ useNavigate: () => state.navigate }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: state.invalidate }) }));
vi.mock('../../components/DonationPrompt/usefulAction', () => ({ recordUsefulAction: state.useful }));
vi.mock('../../components/toastProvider', () => ({
  useToastMessage: () => ({ success: state.success, error: state.error }),
}));
vi.mock('../../components/standardDrawer', () => ({
  StandardDrawer: ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) =>
    isOpen ? <div>{children}</div> : null,
}));
vi.mock('../../components/splitActionButton', () => ({
  SplitActionButton: ({
    label,
    onPress,
    options,
  }: {
    label: string;
    onPress: () => void;
    options: { label: string; onPress: () => void }[];
  }) => (
    <>
      <button onClick={onPress}>{label}</button>
      <button onClick={options[0].onPress}>{options[0].label}</button>
    </>
  ),
}));
vi.mock('@attraccess/react-query-client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/react-query-client')>()),
  useResourcesServiceGetAllResourcesKey: 'resources',
  useResourcesServiceCreateOneResource: (options: typeof state.createOptions) => {
    state.createOptions = options;
    return { mutate: state.create, isPending: false };
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  if (!Element.prototype.getAnimations)
    Object.defineProperty(Element.prototype, 'getAnimations', { configurable: true, value: () => [] });
});
afterEach(() => cleanup());

function openDrawer() {
  render(<CreateResourceDrawer isOpen onOpenChange={state.navigate} />);
}

it('creates another resource with only name and type, then resets the open form', () => {
  openDrawer();
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Laser' } });
  fireEvent.click(screen.getByRole('button', { name: 'door' }));
  fireEvent.click(screen.getByRole('button', { name: 'createAnother' }));
  expect(state.create).toHaveBeenCalledWith({ formData: { name: 'Laser', type: 'door' } });

  act(() => state.createOptions.onSuccess({ id: 4, name: 'Laser' } as Resource));
  expect(screen.getByRole('textbox')).toHaveValue('');
  expect(screen.getByRole('button', { name: 'machine' })).toHaveAttribute('aria-pressed', 'true');
  expect(state.navigate).not.toHaveBeenCalled();
  expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ['resources'] });
});

it('opens the created resource from the default action and keeps invalid names in the drawer', () => {
  openDrawer();
  fireEvent.click(screen.getByRole('button', { name: 'createAndOpen' }));
  expect(state.create).not.toHaveBeenCalled();
  expect(screen.getByText('nameRequired')).toBeInTheDocument();

  fireEvent.change(screen.getByRole('textbox'), { target: { value: '  Saw  ' } });
  fireEvent.click(screen.getByRole('button', { name: 'createAndOpen' }));
  expect(state.create).toHaveBeenCalledWith({ formData: { name: 'Saw', type: 'machine' } });
  act(() => state.createOptions.onSuccess({ id: 5, name: 'Saw' } as Resource));
  expect(state.navigate).toHaveBeenCalledWith(false);
  expect(state.navigate).toHaveBeenCalledWith('/resources/5');
});
