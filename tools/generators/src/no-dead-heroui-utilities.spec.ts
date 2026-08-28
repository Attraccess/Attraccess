import * as fs from 'fs';
import * as path from 'path';

/* eslint-disable @typescript-eslint/no-explicit-any */

// typescript@7's package exports no longer expose the classic compiler API to the type
// system, but it is still there at runtime. Require it untyped rather than pull in a
// second parser just for this check.
const ts = require('typescript');
const tailwind = require('tailwindcss');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const FRONTEND_SRC = path.join(ROOT, 'apps', 'frontend', 'src');
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', 'public']);

/**
 * HeroUI v2 utilities can look valid to TypeScript and tailwind-merge while producing no CSS
 * under v3. Compile every literal class against the installed HeroUI stylesheet so a theme
 * upgrade is the authority, rather than a hand-maintained token list.
 *
 * Dynamic class construction is intentionally outside this guard. Tailwind cannot reliably
 * discover it either, so literals are the safe CI surface. This baseline records existing
 * dead utilities until each is deliberately replaced with the appropriate v3 design token.
 */
const BASELINE = new Map(
  [
    'text-default-500',
    'rounded-medium',
    'border-default-200',
    'text-default-700',
    'lg:divide-default-200',
    'lg:border-default-200',
    'divide-default-200',
    'text-default-400',
    'bg-default-100',
    'flex-gap-2',
    'hover:bg-default-100',
    'active:bg-default-200',
    'focus-visible:ring-primary',
    'bg-primary-100',
    'dark:bg-primary-900/40',
    'text-primary-600',
    'dark:text-primary-300',
    'wrap-none',
    'text-small',
    'text-tiny',
    'text-default-600',
    'hover:bg-primary-50',
    'bg-warning-100',
    'text-warning-800',
    'border-warning-200',
    'border-default-300',
    'dark:bg-primary-900',
    'text-default-300',
    'text-muted-foreground',
    'bg-primary-50',
    'text-primary',
    'text-large',
    'transition-bg',
    'text-success-600',
    'text-danger-500',
    'shadow-medium',
    'bg-content1',
    'text-foreground-400',
    'text-foreground-500',
    'border-divider',
    'text-foreground-700',
    'text-primary-500',
    'bg-default-400',
    'text-warning-600',
    'dark:text-warning-400',
    'dark:border-default-100',
    'divide-default-200/60',
    'text-warning-500',
    'bg-default-200',
    'divide-divider',
    'text-foreground-600',
    'dark:text-success-400',
    'bg-default-50',
    'dark:bg-default-100/10',
    'bg-default-50/60',
    'dark:bg-default-100/5',
    'text-warning-700',
    'bg-warning-50',
    'bg-primary',
    'text-primary-foreground',
    'text-default-900',
    'text-default-800',
    'text-primary-700',
    'dark:text-default-400',
    'rounded-large',
    'shadow-small',
    'dark:bg-primary-900/30',
    'border-primary-200',
    'dark:border-primary-800',
    'dark:text-primary-400',
    'hover:border-primary/50',
    'hover:bg-default-50',
    'bg-primary/10',
    'rounded-small',
  ].map((className) => [className, 'HeroUI v2 utility; replace with a deliberate v3 token.']),
);

function listSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listSourceFiles(full, out);
    else if (/\.[jt]sx?$/.test(entry.name) && !/\.(spec|test)\.[jt]sx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

/** Locally authored CSS selectors are intentionally not Tailwind candidates. */
function customClasses(dir: string, classes = new Set<string>()): Set<string> {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) customClasses(full, classes);
    else if (entry.name.endsWith('.css')) {
      for (const match of fs.readFileSync(full, 'utf8').matchAll(/\.([_a-zA-Z][\w-]*)/g)) classes.add(match[1]);
    }
  }
  return classes;
}

function addClassTokens(node: any, classes: Set<string>): void {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    for (const token of node.text.split(/\s+/)) if (token) classes.add(token);
  }
}

function classExpression(node: any, classes: Set<string>): void {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return addClassTokens(node, classes);
  if (ts.isParenthesizedExpression(node)) return classExpression(node.expression, classes);
  if (ts.isConditionalExpression(node)) {
    classExpression(node.whenTrue, classes);
    return classExpression(node.whenFalse, classes);
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
    return classExpression(node.right, classes);
  }
  if (ts.isArrayLiteralExpression(node)) {
    for (const element of node.elements) classExpression(element, classes);
    return;
  }
  if (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    ['cn', 'clsx', 'twMerge'].includes(node.expression.text)
  ) {
    for (const argument of node.arguments) classExpression(argument, classes);
  }
}

function classesIn(file: string): Set<string> {
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(file, 'utf8'),
    ts.ScriptTarget.ESNext,
    true,
    ts.ScriptKind.TSX,
  );
  const classes = new Set<string>();

  const visit = (node: any): void => {
    if (ts.isJsxAttribute(node) && node.name.text === 'className' && node.initializer) {
      if (ts.isStringLiteral(node.initializer)) addClassTokens(node.initializer, classes);
      else if (ts.isJsxExpression(node.initializer) && node.initializer.expression)
        classExpression(node.initializer.expression, classes);
    }
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      ['cn', 'clsx', 'twMerge'].includes(node.expression.text)
    ) {
      for (const argument of node.arguments) classExpression(argument, classes);
    }
    node.forEachChild(visit);
  };
  visit(source);
  return classes;
}

function stylesheetPath(specifier: string, base: string): string {
  const candidate = specifier.startsWith('.') ? path.resolve(base, specifier) : findPackageStylesheet(specifier, base);
  const packageJson = path.join(candidate, 'package.json');
  const packageStyle = fs.existsSync(packageJson)
    ? (() => {
        const pkg = JSON.parse(fs.readFileSync(packageJson, 'utf8')) as {
          exports?: { '.': { style?: string } };
          main?: string;
        };
        return pkg.exports?.['.']?.style ?? pkg.main;
      })()
    : undefined;
  for (const file of [
    candidate,
    `${candidate}.css`,
    path.join(candidate, 'index.css'),
    packageStyle && path.join(candidate, packageStyle),
  ]) {
    if (file && fs.existsSync(file) && fs.statSync(file).isFile()) return fs.realpathSync(file);
  }
  throw new Error(`Cannot resolve stylesheet ${specifier} from ${base}`);
}

function findPackageStylesheet(specifier: string, from: string): string {
  for (let dir = from; ; dir = path.dirname(dir)) {
    for (const packageDir of [
      path.join(dir, 'node_modules', specifier),
      path.basename(dir) === 'node_modules' && path.join(dir, specifier),
    ]) {
      if (packageDir && fs.existsSync(packageDir)) return packageDir;
    }
    if (path.dirname(dir) === dir) break;
  }
  throw new Error(`Cannot resolve package stylesheet ${specifier} from ${from}`);
}

async function createCompiler(): Promise<any> {
  const stylesEntry = fs.realpathSync(require.resolve('@heroui/styles')).replace(/\.js$/, '.css');
  return tailwind.compile(fs.readFileSync(stylesEntry, 'utf8'), {
    base: path.dirname(stylesEntry),
    loadStylesheet: async (specifier: string, base: string) => {
      const file = stylesheetPath(specifier, base);
      return { base: path.dirname(file), content: fs.readFileSync(file, 'utf8') };
    },
  });
}

function emitsCss(compiled: any, className: string): boolean {
  // build() caches candidates. Compare the output before adding this candidate so each
  // literal is tested independently without recompiling the entire HeroUI theme.
  const before = compiled.build([]);
  return compiled.build([className]) !== before;
}

describe('HeroUI utility classes emit CSS (ATT-858)', () => {
  it('accepts valid tokens and variants while rejecting removed v2 tokens', async () => {
    const compiled = await createCompiler();
    expect(emitsCss(compiled, 'text-danger')).toBe(true);
    expect(emitsCss(compiled, 'dark:text-gray-400')).toBe(true);
    expect(emitsCss(compiled, 'first:border-t-0')).toBe(true);
    expect(emitsCss(compiled, 'text-primary')).toBe(false);
  });

  it('has no newly introduced dead class literals in frontend source', async () => {
    const compiled = await createCompiler();
    const custom = customClasses(FRONTEND_SRC);
    const occurrences = new Map<string, string[]>();
    for (const file of listSourceFiles(FRONTEND_SRC)) {
      for (const className of classesIn(file)) {
        const files = occurrences.get(className) ?? [];
        files.push(path.relative(ROOT, file));
        occurrences.set(className, files);
      }
    }

    const dead = new Map<string, string[]>();
    for (const [className, files] of occurrences) {
      if (!custom.has(className) && !emitsCss(compiled, className)) dead.set(className, files);
    }

    const unbaselined = [...dead]
      .filter(([className]) => !BASELINE.has(className))
      .map(([className, files]) => `${className} (${files.length} files): ${files.join(', ')}`);
    const staleBaseline = [...BASELINE.keys()].filter((className) => !dead.has(className));

    expect(unbaselined.join('\n')).toBe('');
    expect(staleBaseline.join('\n')).toBe('');
  });
});
