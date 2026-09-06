import * as fs from 'fs';
import * as path from 'path';

const root = path.resolve(__dirname, '../../..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');
const tokens = read('libs/ui/src/tokens.css');
const manifest = JSON.parse(read('apps/frontend/src/service-worker/site.webmanifest.json'));

describe('Attraccess brand theme', () => {
  it('keeps the application, browser chrome, and installed app on the same brand color', () => {
    const accent = tokens.match(/--accent:\s*(#[\da-f]{6});/i)?.[1];
    expect(accent).toBe('#256d7b');
    expect(manifest.theme_color).toBe(accent);
    expect(manifest.background_color).toBe('#ffffff');
    expect(read('apps/frontend/index.html')).toContain(`<meta name="theme-color" content="${accent}"`);
    expect(read('apps/api/src/assets/email-defaults/layout.mjml').toLowerCase()).toContain(accent);
  });

  it('keeps normal and hover primary-button text above WCAG AA contrast', () => {
    for (const variable of ['accent', 'accent-hover']) {
      const hex = tokens.match(new RegExp(`--${variable}:\\s*#([\\da-f]{6});`, 'i'))?.[1];
      expect(hex).toBeDefined();
      const channels = hex!.match(/../g)!.map((channel) => {
        const value = parseInt(channel, 16) / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
      const luminance = channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
      expect(1.05 / (luminance + 0.05)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('shares tokens across both applications and starts with a white canvas', () => {
    expect(read('apps/frontend/src/styles.css')).toContain('libs/ui/src/tokens.css');
    expect(read('apps/companion/renderer/src/styles.css')).toContain('libs/ui/src/tokens.css');
    expect(read('apps/frontend/index.html')).toContain('<html class="light" data-theme="light">');
    expect(read('apps/frontend/src/app/app.tsx')).toContain("setTheme('light')");
    expect(read('apps/companion/renderer/src/main.tsx')).toContain('defaultTheme="light"');
    expect(tokens).toContain('--background: #ffffff;');
  });
});
