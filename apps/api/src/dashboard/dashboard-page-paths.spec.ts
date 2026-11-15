import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BUILT_IN_DASHBOARD_PAGE_PATHS } from './dashboard-page-paths';

describe('BUILT_IN_DASHBOARD_PAGE_PATHS', () => {
  it('lists exactly the internal pages of the frontend sidebar', () => {
    const navigation = readFileSync(join(__dirname, '../../../frontend/src/app/layout/sidebar/navigation.tsx'), 'utf8');
    const sidebarPaths = [...navigation.matchAll(/path: '(\/[^']*)'/g)].map(([, path]) => path);

    expect([...BUILT_IN_DASHBOARD_PAGE_PATHS].sort()).toEqual(
      sidebarPaths.filter((path) => path !== '/dashboard').sort(),
    );
  });
});
