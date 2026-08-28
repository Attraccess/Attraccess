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
    'border-primary-500',
    'ring-primary-300',
    'dark:ring-primary-700',
    'border-primary',
    'ring-primary/60',
    'bg-default-300',
    'ring-default-300/30',
    'bg-opacity-75',
    'hover:ring-primary-300',
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
  if (
    ts.isStringLiteral(node) ||
    ts.isNoSubstitutionTemplateLiteral(node) ||
    ts.isTemplateHead(node) ||
    ts.isTemplateMiddle(node) ||
    ts.isTemplateTail(node)
  ) {
    for (const token of node.text.split(/\s+/)) if (token) classes.add(token);
  }
}

function isLiteralClassExpression(node: any): boolean {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node))
    return true;
  if (ts.isParenthesizedExpression(node)) return isLiteralClassExpression(node.expression);
  if (ts.isConditionalExpression(node))
    return isLiteralClassExpression(node.whenTrue) && isLiteralClassExpression(node.whenFalse);
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken)
    return isLiteralClassExpression(node.right);
  return false;
}

function localConstInitializer(identifier: any, checker: any): any {
  const declaration = checker.getSymbolAtLocation(identifier)?.valueDeclaration;
  if (
    declaration &&
    ts.isVariableDeclaration(declaration) &&
    ts.isVariableDeclarationList(declaration.parent) &&
    (declaration.parent.flags & ts.NodeFlags.Const) !== 0 &&
    declaration.initializer &&
    isLiteralClassExpression(declaration.initializer)
  )
    return declaration.initializer;
}

function classExpression(node: any, classes: Set<string>, checker: any, seen = new Set<any>()): void {
  if (seen.has(node)) return;
  seen.add(node);
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return addClassTokens(node, classes);
  if (ts.isIdentifier(node)) {
    const initializer = localConstInitializer(node, checker);
    if (initializer) return classExpression(initializer, classes, checker, seen);
    return;
  }
  if (ts.isTemplateExpression(node)) {
    addClassTokens(node.head, classes);
    for (const span of node.templateSpans) {
      classExpression(span.expression, classes, checker, seen);
      addClassTokens(span.literal, classes);
    }
    return;
  }
  if (ts.isParenthesizedExpression(node)) return classExpression(node.expression, classes, checker, seen);
  if (ts.isConditionalExpression(node)) {
    classExpression(node.whenTrue, classes, checker, seen);
    return classExpression(node.whenFalse, classes, checker, seen);
  }
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
    return classExpression(node.right, classes, checker, seen);
  }
  if (ts.isArrayLiteralExpression(node)) {
    for (const element of node.elements) classExpression(element, classes, checker, seen);
    return;
  }
  if (ts.isObjectLiteralExpression(node)) {
    for (const property of node.properties) {
      if (ts.isPropertyAssignment(property)) {
        if (ts.isStringLiteral(property.name)) addClassTokens(property.name, classes);
        else if (ts.isIdentifier(property.name)) classes.add(property.name.text);
      } else if (ts.isShorthandPropertyAssignment(property)) classes.add(property.name.text);
    }
    return;
  }
  if (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    ['cn', 'clsx', 'twMerge'].includes(node.expression.text)
  ) {
    for (const argument of node.arguments) classExpression(argument, classes, checker, seen);
  }
}

function classesInSource(file: string, content: string): Set<string> {
  // Local lexical resolution needs a checker, not imported modules or standard libraries.
  const options = { allowJs: true, jsx: ts.JsxEmit.Preserve, noResolve: true, noLib: true };
  const host = ts.createCompilerHost(options);
  const getSourceFile = host.getSourceFile.bind(host);
  host.getSourceFile = (name: string, languageVersion: any) =>
    name === file
      ? ts.createSourceFile(file, content, languageVersion, true, ts.ScriptKind.TSX)
      : getSourceFile(name, languageVersion);
  const program = ts.createProgram([file], options, host);
  const source = program.getSourceFile(file);
  if (!source) throw new Error(`Cannot parse ${file}`);
  const checker = program.getTypeChecker();
  const classes = new Set<string>();

  const visit = (node: any): void => {
    if (ts.isJsxAttribute(node) && node.name.text === 'className' && node.initializer) {
      if (ts.isStringLiteral(node.initializer)) addClassTokens(node.initializer, classes);
      else if (ts.isJsxExpression(node.initializer) && node.initializer.expression)
        classExpression(node.initializer.expression, classes, checker);
    }
    if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      ['cn', 'clsx', 'twMerge'].includes(node.expression.text)
    ) {
      for (const argument of node.arguments) classExpression(argument, classes, checker);
    }
    node.forEachChild(visit);
  };
  visit(source);
  return classes;
}

function classesIn(file: string): Set<string> {
  return classesInSource(file, fs.readFileSync(file, 'utf8'));
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
  it('finds object-form and lexically scoped local literal class utilities', () => {
    const classes = classesInSource(
      'example.tsx',
      `
        const valueClass = 'text-primary';
        const dlClass = \`text-danger\`;
        const conditionalClass = condition ? 'bg-success' : 'bg-default-100';
        const interpolatedClass = \`border-primary-500 \${conditionalClass}\`;
        const hidden = condition;
        const invisible = condition;
        const element = <div className={valueClass} />;
        const other = <div className={interpolatedClass} />;
        cn(dlClass, { 'bg-default-100': condition, hidden, invisible: condition });
        function inner() {
          const sharedClass = 'text-primary';
          return <div className={sharedClass} />;
        }
        const sharedClass = 'text-danger';
        const shadowedClass = 'shadowed-class';
        function shadowed(shadowedClass: string) {
          return <div className={shadowedClass} />;
        }
      `,
    );

    expect([...classes]).toEqual([
      'text-primary',
      'border-primary-500',
      'bg-success',
      'bg-default-100',
      'text-danger',
      'hidden',
      'invisible',
    ]);
    expect(classes).not.toContain('shadowed-class');
  });

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
