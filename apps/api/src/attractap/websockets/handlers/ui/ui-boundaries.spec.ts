import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

const sources = readdirSync(__dirname)
  .filter((name) => name.endsWith('.ts') && !/\.spec\.ts$|\.test-fixture\.ts$/.test(name))
  .map((name) => [name, readFileSync(join(__dirname, name), 'utf8')] as const);

describe('handlers/ui boundaries', () => {
  it('contains the UI handler group', () => {
    expect(sources.map(([name]) => name)).toEqual(expect.arrayContaining(['ui.handler.ts', 'ui-step.service.ts']));
  });

  it.each(sources)('%s never reaches the usage service, so UI messages cannot start a session', (_name, source) => {
    expect(source).not.toMatch(/ResourceUsageService|resource-usage\.service|PreStartService|startSession\(/);
  });
});
