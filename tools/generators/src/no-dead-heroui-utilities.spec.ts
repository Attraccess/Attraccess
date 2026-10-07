import * as fs from 'fs';
import * as path from 'path';
import { classesIn, classesInSource, customClasses, listSourceFiles } from './utility-source.test-utils';
import { emitsCss, stylesheetPath } from './utility-stylesheet.test-utils';

/* eslint-disable @typescript-eslint/no-explicit-any */

// typescript@7's package exports no longer expose the classic compiler API to the type
// system, but it is still there at runtime. Require it untyped rather than pull in a
// second parser just for this check.
const tailwind = require('tailwindcss');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const FRONTEND_SRC = path.join(ROOT, 'apps', 'frontend', 'src');
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
    'bg-content1',
    'text-foreground-400',
    'text-foreground-500',
    'border-divider',
    'text-foreground-700',
    'text-primary-500',
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
    'dark:bg-primary-900/30',
    'border-primary-200',
    'dark:border-primary-800',
    'dark:text-primary-400',
    'hover:border-primary/50',
    'hover:bg-default-50',
    'bg-primary/10',
    'rounded-small',
    'border-primary',
    'ring-primary/60',
    'bg-default-300',
    'ring-default-300/30',
    'hover:ring-primary-300',
  ].map((className) => [className, 'HeroUI v2 utility; replace with a deliberate v3 token.']),
);

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

describe('HeroUI utility classes emit CSS (ATT-858)', () => {
  it('finds object-form and lexically scoped local literal class utilities', () => {
    const classes = classesInSource(
      'example.tsx',
      `
        const valueClass = 'text-primary';
        const dlClass = \`text-danger\`;
        const conditionalClass = condition ? 'bg-success' : 'bg-default-100';
        const interpolatedClass = \`border-primary-500 \${conditionalClass}\`;
        const classList = ['text-default-500'];
        const classMap = { 'border-default-200': condition };
        const dynamicClass = getClasses();
        const extraClasses = getClassMap();
        const mixedClassList = ['text-warning-800', dynamicClass];
        const mixedClassMap = { 'text-warning-700': condition, ...extraClasses };
        const hidden = condition;
        const invisible = condition;
        const element = <div className={valueClass} />;
        const other = <div className={interpolatedClass} />;
        cn(
          dlClass,
          classList,
          classMap,
          mixedClassList,
          mixedClassMap,
          { 'bg-default-100': condition, hidden, invisible: condition },
        );
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
      'text-default-500',
      'border-default-200',
      'text-warning-800',
      'text-warning-700',
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
