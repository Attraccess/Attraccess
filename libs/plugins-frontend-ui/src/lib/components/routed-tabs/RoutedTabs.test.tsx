// @vitest-environment happy-dom
import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
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

const Where = () => <output>{useLocation().pathname}</output>;
const mount = (path: string, items = ITEMS) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Where />
      <RoutedTabs items={items} basePath="/res/7" aria-label="Sections" data-cy="tabs" />
    </MemoryRouter>,
  );

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
  it('derives the active tab from the URL, also for nested paths, and lists only visible tabs', () => {
    mount('/res/7/history/11');
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Overview', 'History']);
    expect(screen.getByRole('tab', { name: 'History' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('history-icon')).toBeInTheDocument();
  });

  it('selects the tab at the base path', () => {
    mount('/res/7');
    expect(screen.getByRole('tab', { name: 'Overview' })).toHaveAttribute('aria-selected', 'true');
  });

  it('never offers a hidden tab, even when its URL is open (the page redirects)', () => {
    mount('/res/7/secret');
    expect(screen.queryByRole('tab', { name: 'Secret' })).toBeNull();
    expect(screen.getAllByRole('tab')).toHaveLength(2);
  });

  it('navigates on tab and picker selection', async () => {
    mount('/res/7');
    await userEvent.click(screen.getByRole('tab', { name: 'History' }));
    expect(screen.getByRole('status')).toHaveTextContent('/res/7/history');
    await userEvent.click(screen.getByRole('button', { name: /History/ }));
    await userEvent.click(await screen.findByRole('option', { name: 'Overview' }));
    expect(screen.getByRole('status')).toHaveTextContent('/res/7');
  });

  it('marks the picker and the tabs for tests', () => {
    mount('/res/7');
    expect(document.querySelector('[data-cy="tabs"]')).toBeTruthy();
    expect(document.querySelector('[data-cy="tabs-mobile-picker"]')).toBeTruthy();
  });
});
