import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BUILT_IN_DASHBOARD_PAGE_PATHS, BUILT_IN_DASHBOARD_WIDGET_IDS } from './dashboard-items';

describe('BUILT_IN_DASHBOARD_PAGE_PATHS', () => {
  it('lists exactly the internal pages of the frontend sidebar', () => {
    const navigation = readFileSync(join(__dirname, '../../../frontend/src/app/layout/sidebar/navigation.tsx'), 'utf8');
    const sidebarPaths = [...navigation.matchAll(/path: '(\/[^']*)'/g)].map(([, path]) => path);

    expect([...BUILT_IN_DASHBOARD_PAGE_PATHS].sort()).toEqual(
      sidebarPaths.filter((path) => path !== '/dashboard').sort(),
    );
  });
});

describe('BUILT_IN_DASHBOARD_WIDGET_IDS', () => {
  it('lists exactly the widgets of the frontend registry', () => {
    const registry = readFileSync(join(__dirname, '../../../frontend/src/app/dashboard/widgets/ids.ts'), 'utf8');
    const widgetIds = [...registry.matchAll(/^\s+'([a-z0-9-]+)',$/gm)].map(([, id]) => id);

    expect(widgetIds.length).toBeGreaterThan(0);
    expect([...BUILT_IN_DASHBOARD_WIDGET_IDS].sort()).toEqual(widgetIds.sort());
  });
});
