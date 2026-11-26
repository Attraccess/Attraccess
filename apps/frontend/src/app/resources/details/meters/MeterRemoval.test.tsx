import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MetersCard } from './MetersCard';
import en from './en.json';

const state = vi.hoisted(() => ({
  permissions: new Set<string>(),
  meters: [] as Array<Record<string, unknown>>,
  list: vi.fn(),
  invalidate: vi.fn(),
  archive: vi.fn(),
  restore: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('../../../../hooks/useAuth', () => ({
  useAuth: () => ({ hasPermission: (permission: string) => state.permissions.has(permission) }),
}));
vi.mock('@attraccess/react-query-client', () => ({
  useListResourceMeters: (options: unknown) => {
    state.list(options);
    return { data: state.meters };
  },
  useCreateResourceMeter: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateResourceMeter: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useArchiveResourceMeter: () => ({ mutateAsync: state.archive, isPending: false }),
  useRestoreResourceMeter: () => ({ mutateAsync: state.restore, isPending: false }),
  useDeleteResourceMeter: () => ({ mutateAsync: state.remove, isPending: false }),
  UseListResourceMetersKeyFn: () => ['meters'],
  UseGetResourceMeteringStatusKeyFn: () => ['status'],
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: state.invalidate }) }));
vi.mock('@attraccess/plugins-frontend-ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@attraccess/plugins-frontend-ui')>()),
  useTranslations: () => ({
    t: (key: keyof typeof en, params?: Record<string, string>) =>
      Object.entries(params ?? {}).reduce(
        (out, [name, value]) => out.replaceAll(`{{${name}}}`, String(value)),
        en[key],
      ),
  }),
  useTranslationState: () => ({ language: 'en' }),
  useDateTimeFormatter: () => () => 'yesterday',
}));

const meter = (id: number, name: string, extra: Record<string, unknown> = {}) => ({
  id,
  name,
  creditsPerUnit: 0,
  lifetimeValue: '110',
  latestObservedAt: null,
  session: null,
  archivedAt: null,
  deletable: false,
  ...extra,
});
const archivedMeter = (extra: Record<string, unknown> = {}) =>
  meter(2, 'Old water', { archivedAt: '2026-11-01T10:00:00Z', ...extra });
const button = (name: string) => screen.queryByRole('button', { name });
const archivedToggle = () => screen.queryByRole('button', { name: /Archived meters/ });

describe('removing meters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.permissions = new Set(['resources.update']);
    state.meters = [meter(1, 'Energy')];
    for (const mutation of [state.archive, state.restore, state.remove]) mutation.mockResolvedValue({});
  });

  it('offers no way to remove meters, and no archived ones, without the resource permission', () => {
    state.permissions = new Set(['billing.manage']);
    state.meters = [meter(1, 'Energy', { deletable: true })];
    render(<MetersCard resourceId={7} />);
    expect(button(en.archive)).not.toBeInTheDocument();
    expect(button(en.delete)).not.toBeInTheDocument();
    expect(archivedToggle()).not.toBeInTheDocument();
    expect(state.list).toHaveBeenCalledWith({ path: { resourceId: 7 } });
  });

  it('hides the whole card from regular users when no meter is active', () => {
    state.permissions = new Set();
    state.meters = [];
    const { container } = render(<MetersCard resourceId={7} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('offers Delete only for a meter without history', () => {
    render(<MetersCard resourceId={7} />);
    expect(button(en.archive)).toBeInTheDocument();
    expect(button(en.delete)).not.toBeInTheDocument();
    expect(archivedToggle()).not.toBeInTheDocument();
    expect(state.list).toHaveBeenCalledWith({ path: { resourceId: 7 }, query: { includeArchived: true } });
  });

  it.each([
    ['archive', en.archive, 'Archive Energy?', () => state.archive],
    ['delete', en.delete, 'Delete Energy?', () => state.remove],
  ] as const)('asks before it runs %s, then reloads the list', async (_action, label, title, mutation) => {
    state.meters = [meter(1, 'Energy', { deletable: true })];
    render(<MetersCard resourceId={7} />);
    fireEvent.click(screen.getByRole('button', { name: label }));
    expect(mutation()).not.toHaveBeenCalled();

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(title)).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: label }));

    await waitFor(() => expect(mutation()).toHaveBeenCalledWith({ path: { resourceId: 7, meterId: 1 } }));
    await waitFor(() => expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ['meters'] }));
  });

  it.each([
    ['METER_IN_USE', en.errorInUse],
    ['METER_HAS_HISTORY', en.errorHasHistory],
    ['SOMETHING_ELSE', en.errorAction],
  ])('explains a %s refusal', async (code, message) => {
    state.meters = [meter(1, 'Energy', { deletable: true })];
    state.remove.mockRejectedValue(Object.assign(new Error('Conflict'), { body: { message: code } }));
    render(<MetersCard resourceId={7} />);
    fireEvent.click(screen.getByRole('button', { name: en.delete }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: en.delete }));
    expect(await screen.findByText(message)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(state.invalidate).toHaveBeenCalled();
  });

  it('lists archived meters in a collapsed section with restore and rename', async () => {
    state.meters = [meter(1, 'Energy'), archivedMeter()];
    render(<MetersCard resourceId={7} />);
    const toggle = screen.getByRole('button', { name: /Archived meters \(1\)/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(button(en.restore)).not.toBeInTheDocument();

    fireEvent.click(toggle);

    expect(screen.getByRole('heading', { name: 'Old water' })).toBeInTheDocument();
    expect(screen.getByText('Archived: yesterday')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: en.rename })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: en.archive })).toHaveLength(1);
    expect(button(en.delete)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: en.restore }));
    await waitFor(() => expect(state.restore).toHaveBeenCalledWith({ path: { resourceId: 7, meterId: 2 } }));
  });

  it('offers Delete on an archived meter without history, and explains a name clash on restore', async () => {
    state.meters = [archivedMeter({ deletable: true })];
    state.restore.mockRejectedValue(Object.assign(new Error('Conflict'), { body: { message: 'METER_NAME_EXISTS' } }));
    render(<MetersCard resourceId={7} />);
    expect(screen.getByText(en.empty)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Archived meters/ }));
    expect(button(en.delete)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: en.restore }));
    expect(await screen.findByText(en.errorNameExists)).toBeInTheDocument();
  });
});
