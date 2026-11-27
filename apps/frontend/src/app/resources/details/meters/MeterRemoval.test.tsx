import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MetersCard } from './MetersCard';
import { MeterSelector } from './MeterSelector';
import en from './en.json';

const state = vi.hoisted(() => ({
  permissions: new Set<string>(),
  meters: [] as Array<Record<string, unknown>>,
  list: vi.fn(),
  invalidate: vi.fn(),
  archive: vi.fn(),
  restore: vi.fn(),
  remove: vi.fn(),
  rename: vi.fn(),
}));

vi.mock('../../../../hooks/useAuth', () => ({
  useAuth: () => ({ hasPermission: (permission: string) => state.permissions.has(permission) }),
}));
vi.mock('@attraccess/react-query-client', () => ({
  // Like the server: archived meters only on request, and nothing for a disabled query.
  useListResourceMeters: (
    options: { query?: { includeArchived?: boolean } },
    _key: unknown,
    queryOptions?: { enabled?: boolean },
  ) => {
    state.list(options, queryOptions);
    if (queryOptions?.enabled === false) return { data: undefined };
    return { data: options.query?.includeArchived ? state.meters : state.meters.filter((m) => !m.archivedAt) };
  },
  useCreateResourceMeter: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateResourceMeter: () => ({ mutateAsync: state.rename, isPending: false }),
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
const trigger = (name: string) => screen.queryByRole('button', { name: `Actions for ${name}` });
const archivedToggle = () => screen.queryByRole('button', { name: /Archived meters/ });
/** Opens a meter's ⋮ menu and returns the labels of its entries. */
async function openMenu(name: string) {
  await userEvent.click(screen.getByRole('button', { name: `Actions for ${name}` }));
  return within(await screen.findByRole('menu'))
    .getAllByRole('menuitem')
    .map((item) => item.textContent);
}
async function choose(name: string, label: string) {
  await openMenu(name);
  await userEvent.click(screen.getByRole('menuitem', { name: label }));
}
async function confirm(label: string) {
  await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: label }));
}
const refusal = (code: string) => Object.assign(new Error('Conflict'), { body: { message: code } });

describe('removing meters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.permissions = new Set(['resources.update']);
    state.meters = [meter(1, 'Energy')];
    for (const mutation of [state.archive, state.restore, state.remove]) mutation.mockResolvedValue({});
  });

  it('gives people without the resource permission no menu and no archived meters', () => {
    state.permissions = new Set(['billing.manage']);
    state.meters = [meter(1, 'Energy', { deletable: true })];
    render(<MetersCard resourceId={7} />);
    expect(screen.getByRole('heading', { name: 'Energy' })).toBeInTheDocument();
    expect(trigger('Energy')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(archivedToggle()).not.toBeInTheDocument();
    expect(state.list).not.toHaveBeenCalledWith(expect.objectContaining({ query: { includeArchived: true } }), {
      enabled: true,
    });
  });

  it('hides the whole card from regular users when no meter is active', () => {
    state.permissions = new Set();
    state.meters = [];
    const { container } = render(<MetersCard resourceId={7} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('keeps every action of a meter in its menu, and offers Delete only without history', async () => {
    render(<MetersCard resourceId={7} />);
    // The only buttons: the meter's menu and "Create meter".
    expect(screen.getAllByRole('button')).toHaveLength(2);
    expect(await openMenu('Energy')).toEqual([en.rename, en.archive]);
    expect(archivedToggle()).not.toBeInTheDocument();
    // Active meters are polled on the key the rest of the page shares; archived ones are loaded once.
    expect(state.list).toHaveBeenCalledWith({ path: { resourceId: 7 } }, { refetchInterval: 10_000 });
    expect(state.list).toHaveBeenCalledWith(
      { path: { resourceId: 7 }, query: { includeArchived: true } },
      { enabled: true },
    );
  });

  it.each([
    ['archive', en.archive, 'Archive Energy?', () => state.archive],
    ['delete', en.delete, 'Delete Energy?', () => state.remove],
  ] as const)('asks before it runs %s, then reloads the list', async (_action, label, title, mutation) => {
    state.meters = [meter(1, 'Energy', { deletable: true })];
    render(<MetersCard resourceId={7} />);
    await choose('Energy', label);

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(title)).toBeInTheDocument();
    expect(mutation()).not.toHaveBeenCalled();
    await confirm(label);

    await waitFor(() => expect(mutation()).toHaveBeenCalledWith({ path: { resourceId: 7, meterId: 1 } }));
    await waitFor(() => expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ['meters'] }));
  });

  it('runs nothing when a confirmation is cancelled', async () => {
    state.meters = [meter(1, 'Energy', { deletable: true })];
    render(<MetersCard resourceId={7} />);
    await choose('Energy', en.delete);
    await confirm('Cancel');
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(state.remove).not.toHaveBeenCalled();
  });

  it.each([
    ['METER_IN_USE', en.errorInUseDelete],
    ['METER_HAS_HISTORY', en.errorHasHistory],
    ['METER_NOT_FOUND', en.errorNotFound],
    ['SOMETHING_ELSE', en.errorAction],
  ])('explains a %s refusal', async (code, message) => {
    state.meters = [meter(1, 'Energy', { deletable: true })];
    state.remove.mockRejectedValue(refusal(code));
    render(<MetersCard resourceId={7} />);
    await choose('Energy', en.delete);
    await confirm(en.delete);
    expect(await screen.findByRole('alert')).toHaveTextContent(message);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(state.invalidate).toHaveBeenCalled();
  });

  it('does not tell someone who is archiving a meter in use to archive it', async () => {
    state.archive.mockRejectedValue(refusal('METER_IN_USE'));
    render(<MetersCard resourceId={7} />);
    await choose('Energy', en.archive);
    await confirm(en.archive);
    expect(await screen.findByRole('alert')).toHaveTextContent(en.errorInUse);
    expect(screen.getByRole('alert')).not.toHaveTextContent(/archive it/i);
  });

  it('shows the name editor in place of the menu, focused, while a meter is renamed', async () => {
    render(<MetersCard resourceId={7} />);
    await choose('Energy', en.rename);
    const input = screen.getByRole('textbox', { name: en.name });
    expect(input).toHaveValue('Energy');
    await waitFor(() => expect(input).toHaveFocus());
    // And it stays there once the menu has finished closing.
    await new Promise((resolve) => setTimeout(resolve, 1100));
    expect(input).toHaveFocus();
    expect(trigger('Energy')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: en.cancel }));
    expect(trigger('Energy')).toBeInTheDocument();
    expect(state.rename).not.toHaveBeenCalled();
  });

  it('lists archived meters in a collapsed section with their own menu', async () => {
    state.meters = [meter(1, 'Energy'), archivedMeter()];
    render(<MetersCard resourceId={7} />);
    const toggle = screen.getByRole('button', { name: /Archived meters \(1\)/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(trigger('Old water')).not.toBeInTheDocument();

    await userEvent.click(toggle);

    expect(screen.getByRole('heading', { name: 'Old water' })).toBeInTheDocument();
    expect(screen.getByText('Archived: yesterday')).toBeInTheDocument();
    expect(await openMenu('Old water')).toEqual([en.rename, en.restore]);
    await userEvent.click(screen.getByRole('menuitem', { name: en.restore }));
    await waitFor(() => expect(state.restore).toHaveBeenCalledWith({ path: { resourceId: 7, meterId: 2 } }));
  });

  it('offers Delete on an archived meter without history, and explains a name clash on restore', async () => {
    state.meters = [archivedMeter({ deletable: true })];
    state.restore.mockRejectedValue(refusal('METER_NAME_EXISTS'));
    render(<MetersCard resourceId={7} />);
    expect(screen.getByText(en.emptyActive)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Archived meters/ }));
    expect(await openMenu('Old water')).toEqual([en.rename, en.restore, en.delete]);
    await userEvent.click(screen.getByRole('menuitem', { name: en.restore }));
    expect(await screen.findByRole('alert')).toHaveTextContent(en.errorNameExists);

    // Renaming settles the clash, so the message goes.
    state.rename.mockResolvedValue({ id: 2, name: 'Older water' });
    await choose('Old water', en.rename);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Older water' } });
    await userEvent.click(screen.getByRole('button', { name: en.save }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
    expect(state.rename).toHaveBeenCalledWith({ path: { resourceId: 7, meterId: 2 }, body: { name: 'Older water' } });
  });

  it('tells the flow editor that the chosen meter is archived or removed', () => {
    const { rerender } = render(<MeterSelector resourceId={7} value={2} onChange={vi.fn()} />);
    expect(screen.getByText(en.missing)).toBeInTheDocument();
    rerender(<MeterSelector resourceId={7} value={1} onChange={vi.fn()} />);
    expect(screen.queryByText(en.missing)).not.toBeInTheDocument();
  });

  it('reloads the archived meters when someone else changes the active ones', () => {
    state.meters = [meter(1, 'Energy'), archivedMeter()];
    const { rerender } = render(<MetersCard resourceId={7} />);
    rerender(<MetersCard resourceId={7} />);
    expect(state.invalidate).not.toHaveBeenCalled();

    state.meters = [archivedMeter(), meter(1, 'Energy', { archivedAt: '2026-11-02T10:00:00Z' })];
    rerender(<MetersCard resourceId={7} />);
    expect(state.invalidate).toHaveBeenCalledWith({ queryKey: ['meters'] });
  });
});
