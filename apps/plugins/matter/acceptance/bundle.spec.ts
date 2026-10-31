import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Needs `build-backend` first (the e2e target depends on it).
const bundle = readFileSync(join(__dirname, '../package/dist/index.js'), 'utf8');

describe('Matter plugin bundle', () => {
  it('contains no matter.js, no core imports and no unresolved contract imports', () => {
    expect(bundle).not.toMatch(/@matter\//);
    expect(bundle).not.toMatch(/matter-contract/);
    expect(bundle).not.toMatch(/apps\/api|database-entities|@attraccess\/shared/);
    const required = [...bundle.matchAll(/require\("([^"]+)"\)/g)].map((match) => match[1]);
    expect(
      required.filter((name) => name.startsWith('@attraccess/') && name !== '@attraccess/plugins-backend-sdk'),
    ).toEqual([]);
  });

  it('opens no connection to the sidecar', () => {
    expect(bundle).not.toMatch(/\bfetch\(|WebSocket|node:http|require\("(?:http|https|net|ws)"\)|matter-sidecar/);
  });
});
