import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Both the bundled main process (out/) and source execution resolve the packaged src/assets/.
// The static SVG embeds the original mascot and keeps the wordmark themeable via currentColor.
export const attraccessLogoSvg = readFileSync(join(__dirname, '../src/assets/logo.svg'), 'utf8');
