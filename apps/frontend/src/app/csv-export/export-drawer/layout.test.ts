import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('CsvExportDrawerContent layout', () => {
  it('keeps body controls scrollable above the sticky drawer footer', () => {
    const source = readFileSync(join(__dirname, 'index.tsx'), 'utf8');

    expect(source).toContain('pb-24');
  });

  it('wraps template actions on narrow drawers', () => {
    const source = readFileSync(join(__dirname, 'template-section.tsx'), 'utf8');

    expect(source).toContain('flex flex-wrap items-center gap-2');
  });
});
