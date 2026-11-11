import { readdirSync, readFileSync } from 'fs';
import { join, relative } from 'path';

const SOURCE_ROOT = join(__dirname, '..');

function sourceFiles(directory = SOURCE_ROOT): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : sourceFiles(path);
    return entry.name.endsWith('.ts') && !/\.(spec|test-fixture|e2e-spec)\.ts$/.test(entry.name) ? [path] : [];
  });
}

/** Identifiers that reach audit storage. Comments are stripped first, so prose may still name them. */
const RECORDER_TOKENS = ['AuditService', 'AuditRecorder', 'AUDIT_RECORDER', 'IdentityAuditService', 'SsoAuditService'];

function code(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function usedTokens(path: string, tokens: string[]): string[] {
  const source = code(path);
  return tokens.filter((token) => new RegExp(`\\b${token}\\b`).test(source));
}

describe('audit boundaries', () => {
  const files = sourceFiles();

  it('keeps audit out of controllers and route helpers: the services that own a change record it', () => {
    const httpEdge = files.filter(
      (path) => /(\.controller|routes)\.ts$/.test(path) || /@Controller\(/.test(code(path)),
    );
    expect(httpEdge.length).toBeGreaterThan(50);
    const violations = httpEdge
      .map((path) => ({
        file: relative(SOURCE_ROOT, path),
        tokens: usedTokens(path, [...RECORDER_TOKENS, 'AuthAuditLogger']),
      }))
      .filter(({ tokens }) => tokens.length > 0);
    expect(violations).toEqual([]);
  });

  it('lets guards, interceptors and strategies record auth events only through AuthAuditLogger', () => {
    const enhancers = files.filter((path) => /\.(guard|interceptor|strategy)\.ts$/.test(path));
    expect(enhancers.length).toBeGreaterThan(5);
    const violations = enhancers
      .map((path) => ({ file: relative(SOURCE_ROOT, path), tokens: usedTokens(path, RECORDER_TOKENS) }))
      .filter(({ tokens }) => tokens.length > 0);
    expect(violations).toEqual([]);
  });

  it('keeps domain modules off AuditModule: they depend on the global AUDIT_RECORDER port', () => {
    const importers = files
      .filter((path) => /\bAuditModule\b/.test(code(path)))
      .map((path) => relative(SOURCE_ROOT, path))
      .sort();
    expect(importers).toEqual(['app/app.module.ts', 'audit/audit.module.ts']);
  });

  it('declares the port without depending on the audit implementation', () => {
    const port = code(join(SOURCE_ROOT, 'audit/recorder/audit-event.ts'));
    expect(port).not.toMatch(/audit\.service|audit\.module/);
    expect(files.filter((path) => /forwardRef\([^)]*Audit/.test(code(path)))).toEqual([]);
  });
});
