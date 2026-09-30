import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TestWrapper } from '../../test-utils/wrappers';
import { PageHeaderActions, PageAction } from './actions';

vi.mock('@attraccess/plugins-frontend-ui', () => ({
  useTranslations: () => ({
    t: (key: string) => (key === 'more' ? 'More actions' : key),
    language: 'en',
  }),
}));

function renderActions(actions: PageAction[], extra?: { maxVisible?: number }) {
  return render(<PageHeaderActions actions={actions} maxVisible={extra?.maxVisible} />, {
    wrapper: TestWrapper,
  });
}

describe('PageHeaderActions', () => {
  it('renders no action buttons when actions array is empty', () => {
    renderActions([]);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('skips hidden actions', () => {
    renderActions([
      { key: 'a', label: 'Visible', onPress: vi.fn() },
      { key: 'b', label: 'Hidden', isHidden: true, onPress: vi.fn() },
    ]);
    expect(screen.getByRole('button', { name: 'Visible' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hidden' })).not.toBeInTheDocument();
  });

  it('moves destructive actions into the overflow dropdown', async () => {
    const destructive = vi.fn();
    renderActions([
      { key: 'edit', label: 'Edit', onPress: vi.fn() },
      { key: 'delete', label: 'Delete', variant: 'destructive', onPress: destructive },
    ]);

    expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();

    const trigger = screen.getByRole('button', { name: 'More actions' });
    await userEvent.click(trigger);
    const deleteItem = await screen.findByRole('menuitem', { name: 'Delete' });
    expect(deleteItem).toHaveClass('text-danger');

    await userEvent.click(deleteItem);
    expect(destructive).toHaveBeenCalled();
  });

  it('collapses surplus actions beyond maxVisible into overflow', async () => {
    const handlers = Array.from({ length: 6 }, () => vi.fn());
    renderActions(
      handlers.map((onPress, idx) => ({
        key: `a${idx}`,
        label: `Action ${idx}`,
        onPress,
      })),
      { maxVisible: 3 },
    );

    expect(screen.getByRole('button', { name: 'Action 0' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Action 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Action 2' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Action 3' })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'More actions' }));
    expect(await screen.findByRole('menuitem', { name: 'Action 3' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Action 4' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Action 5' })).toBeInTheDocument();
  });

  it('fires onPress when an inline action is clicked', async () => {
    const onPress = vi.fn();
    renderActions([{ key: 'go', label: 'Go', onPress }]);
    await userEvent.click(screen.getByRole('button', { name: 'Go' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('passes outline/sm styling to renderTrigger', () => {
    let captured: { variant?: string; size?: string } = {};
    renderActions([
      {
        key: 'custom',
        label: 'Custom',
        renderTrigger: (triggerProps) => {
          captured = { variant: triggerProps.variant, size: triggerProps.size };
          return <button type="button">{triggerProps.children}</button>;
        },
      },
    ]);
    expect(captured.variant).toBe('outline');
    expect(captured.size).toBe('sm');
  });

  it('uses the brand variant for primary actions without promoting secondary actions', () => {
    renderActions([
      { key: 'create', label: 'Create', variant: 'primary', onPress: vi.fn() },
      { key: 'export', label: 'Export', variant: 'secondary', onPress: vi.fn() },
    ]);
    expect(screen.getByRole('button', { name: 'Create' })).toHaveClass('button--primary');
    expect(screen.getByRole('button', { name: 'Export' })).toHaveClass('button--outline');
  });

  it('passes the primary variant to custom triggers', () => {
    const renderTrigger = vi.fn((props) => <button type="button">{props.children}</button>);
    renderActions([{ key: 'create', label: 'Create', variant: 'primary', renderTrigger }]);
    expect(renderTrigger).toHaveBeenCalledWith(expect.objectContaining({ variant: 'primary', size: 'sm' }));
  });
});
