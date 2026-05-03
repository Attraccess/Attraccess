// Asserts react-query-client codegen target has no sed post-processing
// FEATURE: Codegen contract — drop sed workaround (ATT-275)

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PROJECT_JSON = resolve(__dirname, '../../project.json');

interface ProjectConfig {
  targets: {
    generate: {
      options: {
        command: string;
      };
    };
  };
}

describe('react-query-client project.json — codegen target', () => {
  const config = JSON.parse(readFileSync(PROJECT_JSON, 'utf8')) as ProjectConfig;
  const command = config.targets.generate.options.command;

  it('has a string command', () => {
    expect(typeof command).toBe('string');
  });

  it('starts with the openapi-rq generator invocation', () => {
    expect(command).toMatch(/^pnpm openapi-rq /);
  });

  it('does not invoke sed', () => {
    expect(command).not.toMatch(/\bsed\b/);
  });

  it('does not reference .bak backup files', () => {
    expect(command).not.toContain('.bak');
  });

  it('does not target infiniteQueries.ts for post-processing', () => {
    expect(command).not.toContain('infiniteQueries.ts');
  });

  it('does not chain post-processing shell commands after the generator', () => {
    expect(command).not.toMatch(/&&\s*(sed|rm|awk|perl)\b/);
  });
});
