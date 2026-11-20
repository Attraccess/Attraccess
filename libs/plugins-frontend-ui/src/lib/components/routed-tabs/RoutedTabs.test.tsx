// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { RoutedTabs, type RoutedTabItem } from './RoutedTabs';
import { activeRoutedTab, firstSegmentBelow, routedTabPath } from './routedTabPath';

const ITEMS: RoutedTabItem[] = [
  { key: 'overview', label: 'Overview', path: '' },
  { key: 'history', label: 'History', path: 'history', icon: <svg data-testid="history-icon" /> },
  { key: 'secret', label: 'Secret', path: 'secret', hidden: true },
];

beforeAll(() => {
  if (!Element.prototype.getAnimations)
    Object.defineProperty(Element.prototype, 'getAnimations', { configurable: true, value: () => [] });
});
afterEach(cleanup);

/** Renders the tabs on every path, so the router's location and history action can be read after each step. */
const mount = async (path: string, props: { items?: RoutedTabItem[]; fallbackKey?: string } = {}) => {
  const element = (
    <RoutedTabs
      items={props.items ?? ITEMS}
      basePath="/res/7"
      fallbackKey={props.fallbackKey}
      aria-label="Sections"
      data-cy="tabs"
    />
  );
  const router = createMemoryRouter([{ path: '*', element }], { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  await screen.findAllByRole('tab');
  // Let HeroUI's tab indicator settle, so no state update lands outside act.
  await act(async () => undefined);
  return router;
};

describe('routedTabPath helpers', () => {
  it('joins, splits and matches paths', () => {
    expect(routedTabPath('/m', '')).toBe('/m');
    expect(routedTabPath('/m', 'a')).toBe('/m/a');
    expect(firstSegmentBelow('/m', '/m')).toBe('');
    expect(firstSegmentBelow('/m', '/m/a/b')).toBe('a');
    expect(firstSegmentBelow('/m', '/other/a')).toBe('');
    expect(firstSegmentBelow('/m', '/mx/a')).toBe('');
    expect(activeRoutedTab([{ path: '' }, { path: 'a' }], '/m', '/m/a/9')).toEqual({ path: 'a' });
    expect(activeRoutedTab([{ path: 'a' }], '/m', '/m/zzz')).toBeUndefined();
  });
});

describe('RoutedTabs', () => {
  it('derives the active tab from the URL, also for nested paths, and lists only visible tabs', async () => {
    await mount('/res/7/history/11');
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Overview', 'History']);
    expect(screen.getByRole('tab', { name: 'History' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('history-icon')).toBeInTheDocument();
  });

  it('selects the tab at the base path', async () => {
    await mount('/res/7');
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
  });

  it('never offers a hidden tab and shows the first visible tab without navigating', async () => {
    const router = await mount('/res/7/secret');
    expect(screen.queryByRole('tab', { name: 'Secret' })).toBeNull();
    expect(screen.getAllByRole('tab')).toHaveLength(2);
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
    expect(router.state.location.pathname).toBe('/res/7/secret');
  });

  it('shows the fallback tab while no tab matches the location', async () => {
    const router = await mount('/res/7/unknown', { fallbackKey: 'history' });
    expect(screen.getByRole('tab', { name: 'History' })).toHaveAttribute('aria-selected', 'true');
    expect(router.state.location.pathname).toBe('/res/7/unknown');
  });

  it('pushes a history entry per tab switch, so back returns to the previous tab', async () => {
    const router = await mount('/res/7');
    await userEvent.click(screen.getByRole('tab', { name: 'History' }));
    expect(router.state.location.pathname).toBe('/res/7/history');
    expect(router.state.historyAction).toBe('PUSH');
    await act(() => router.navigate(-1));
    expect(router.state.location.pathname).toBe('/res/7');
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
  });

  it('goes back to the tab root when the active tab is chosen on a nested URL', async () => {
    const router = await mount('/res/7/history/11');
    await userEvent.click(screen.getByRole('tab', { name: 'History' }));
    expect(router.state.location.pathname).toBe('/res/7/history');
    expect(router.state.historyAction).toBe('PUSH');
    // One entry: back returns to the nested URL.
    await act(() => router.navigate(-1));
    expect(router.state.location.pathname).toBe('/res/7/history/11');
  });

  it('navigates with the picker, including back to the root of the active tab', async () => {
    const router = await mount('/res/7/history/11');
    await userEvent.click(screen.getByRole('button', { name: /History/ }));
    await userEvent.click(await screen.findByRole('option', { name: 'History' }));
    expect(router.state.location.pathname).toBe('/res/7/history');
    await act(() => router.navigate(-1));
    expect(router.state.location.pathname).toBe('/res/7/history/11');
    await act(() => router.navigate(1));
    await userEvent.click(screen.getByRole('button', { name: /History/ }));
    await userEvent.click(await screen.findByRole('option', { name: 'Overview' }));
    expect(router.state.location.pathname).toBe('/res/7');
    expect(router.state.historyAction).toBe('PUSH');
  });

  it('marks the picker, its options and the tabs for tests', async () => {
    await mount('/res/7');
    expect(document.querySelector('[data-cy="tabs"]')).toBeTruthy();
    expect(document.querySelector('[data-cy="tabs-mobile-picker"]')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: /Overview/ }));
    await screen.findByRole('option', { name: 'History' });
    expect(document.querySelector('[data-cy="select-item-history"]')).toBeTruthy();
  });
});
