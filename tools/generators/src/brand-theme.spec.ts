import { spawnSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { runInNewContext } from 'vm';

const root = path.resolve(__dirname, '../../..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');
const tokens = read('libs/ui/src/tokens.css');
const manifest = JSON.parse(read('apps/frontend/src/service-worker/site.webmanifest.json'));

function contrast(first: string, second: string) {
  const luminance = (hex: string) => {
    const channels = hex
      .slice(1)
      .match(/../g)!
      .map((channel) => {
        const value = parseInt(channel, 16) / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
    return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
  };
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

function themeColors(theme: string) {
  const split = tokens.indexOf('  .dark,');
  const css = theme === 'light' ? tokens.slice(0, split) : tokens.slice(split);
  return Object.fromEntries([...css.matchAll(/--([\w-]+):\s*(#[\da-f]{6});/gi)].map((match) => [match[1], match[2]]));
}

describe('Attraccess brand theme', () => {
  it('keeps the application, browser chrome, and installed app on the same brand color', () => {
    const accent = tokens.match(/--accent:\s*(#[\da-f]{6});/i)?.[1];
    expect(accent).toBe('#256d7b');
    expect(manifest.theme_color).toBe(accent);
    expect(manifest.background_color).toBe('#ffffff');
    expect(read('apps/frontend/index.html')).toContain(`<meta name="theme-color" content="${accent}"`);
    expect(read('apps/api/src/assets/email-defaults/layout.mjml').toLowerCase()).toContain(accent);
  });

  it.each(['light', 'dark'])('keeps %s brand text and charts above WCAG AA contrast', (theme) => {
    const colors = themeColors(theme);
    for (const background of ['accent', 'accent-hover']) {
      expect(contrast(colors[background], colors['accent-foreground'])).toBeGreaterThanOrEqual(4.5);
    }
    for (const foreground of ['foreground', 'muted', 'accent', 'chart-sessions', 'chart-minutes', 'chart-spend']) {
      expect(contrast(colors[foreground], colors.background)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(['light', 'dark'])('keeps %s field borders above WCAG non-text contrast on every surface', (theme) => {
    const colors = themeColors(theme);
    const surfaces = ['background', 'surface', 'surface-secondary', 'surface-tertiary', 'overlay', 'default'];
    for (const token of ['field-border', 'field-border-hover', ...surfaces]) {
      expect({ token, value: colors[token] }).toEqual({ token, value: expect.stringMatching(/^#/) });
    }
    const failures = ['field-border', 'field-border-hover'].flatMap((border) =>
      surfaces
        .map((surface) => ({ pair: `${border} on ${surface}`, ratio: contrast(colors[border], colors[surface]) }))
        .filter(({ ratio }) => ratio < 3),
    );
    expect(failures).toEqual([]);
    expect(contrast(colors['field-border'], colors['field-border-hover'])).toBeGreaterThanOrEqual(1.4);
  });

  it('keeps the Attractap display field border on the dark web token', () => {
    const hex = themeColors('dark')['field-border'].slice(1).toUpperCase();
    expect(read('apps/attractap/firmware/src/display/theme.hpp')).toContain(
      `fieldBorder() { return lv_color_hex(0x${hex}); }`,
    );
  });

  it('leaves field borders to the shared tokens instead of component overrides', () => {
    // Matches assignments (`--field-border:` in CSS or Tailwind, `'--field-border'` as a style key), not reads.
    const overrides = spawnSync(
      'git',
      [
        'grep',
        '-n',
        '-E',
        '-e',
        '--(color-field-border|field-border|border-width-field)[a-z-]*([\'"]|[[:space:]]*:)',
        '--',
        'libs/*.ts',
        'libs/*.tsx',
        'libs/*.css',
        'apps/*.ts',
        'apps/*.tsx',
        'apps/*.css',
        ':!libs/ui/src/tokens.css',
      ],
      { cwd: root, encoding: 'utf8' },
    );
    expect({
      status: overrides.status,
      stdout: overrides.stdout,
      stderr: overrides.stderr,
      error: overrides.error,
    }).toEqual({ status: 1, stdout: '', stderr: '', error: undefined });
  });

  it('shares tokens across both applications while following the system appearance by default', () => {
    expect(read('apps/frontend/src/styles.css')).toContain('libs/ui/src/tokens.css');
    expect(read('apps/companion/renderer/src/styles.css')).toContain('libs/ui/src/tokens.css');
    expect(read('apps/frontend/index.html')).toContain('<html>');
    expect(read('libs/ui/src/Providers.tsx')).toContain("defaultTheme = 'system'");
    expect(read('apps/frontend/src/main.tsx')).toContain('<Providers>');
    expect(read('apps/companion/renderer/src/main.tsx')).toContain('<Providers>');
    expect(tokens).toContain('--background: #ffffff;');
  });

  describe.each(['apps/frontend/index.html', 'apps/companion/renderer/index.html'])('%s first paint', (file) => {
    it.each([
      [null, true, 'dark'],
      ['dark', false, 'dark'],
      ['light', true, 'light'],
      ['system', true, 'dark'],
      ['system', false, 'light'],
      ['invalid', true, 'dark'],
      ['blocked', true, 'dark'],
    ])('resolves saved %s with OS dark=%s before React loads', (saved, osDark, expected) => {
      const script = read(file).match(/<script id="theme-init">([\s\S]*?)<\/script>/)?.[1];
      expect(script).toBeDefined();
      const classes = new Set(['light', 'dark', 'unrelated-class']);
      const root = {
        classList: {
          remove: (...names: string[]) => names.forEach((name) => classes.delete(name)),
          add: (name: string) => classes.add(name),
        },
        dataset: {} as Record<string, string>,
        style: {} as Record<string, string>,
      };
      runInNewContext(script!, {
        localStorage: {
          getItem: () => {
            if (saved === 'blocked') throw new Error('Blocked');
            return saved;
          },
        },
        window: { matchMedia: () => ({ matches: osDark }) },
        document: { documentElement: root },
      });
      expect([...classes].sort()).toEqual([expected, 'unrelated-class'].sort());
      expect(root.dataset.theme).toBe(expected);
      expect(root.style.colorScheme).toBe(expected);
    });
  });
});
