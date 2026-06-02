import * as fs from 'fs';
import * as path from 'path';

export const ROOT = path.resolve(__dirname, '..', '..', '..');

export function readFile(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf-8').trim();
}

export function fileExists(relativePath: string): boolean {
  return fs.existsSync(path.join(ROOT, relativePath));
}

export function extractServiceBlock(compose: string, serviceName: string): string {
  const lines = compose.split('\n');
  const start = lines.findIndex((l) => new RegExp(`^\\s{2}${serviceName}:\\s*$`).test(l));
  if (start === -1) return '';
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^\s{2}\S/.test(lines[i]) || /^\S/.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join('\n');
}
