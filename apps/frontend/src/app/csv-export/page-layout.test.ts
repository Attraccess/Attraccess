import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('CSV export page layout', () => {
  it('uses dedicated configure pages instead of the config drawer', () => {
    const pageSource = readFileSync(join(__dirname, 'index.tsx'), 'utf8');

    expect(pageSource).not.toContain('StandardDrawer');
    expect(pageSource).not.toContain('DrawerHeader');
    expect(pageSource).toContain('useNavigate');
  });

  it('registers dedicated routes for each CSV export configuration', () => {
    const routesSource = readFileSync(join(__dirname, '../routes/index.tsx'), 'utf8');

    expect(routesSource).toContain("path: '/csv-export/resource-usage-hours'");
    expect(routesSource).toContain("path: '/csv-export/billing-transactions'");
  });
});
