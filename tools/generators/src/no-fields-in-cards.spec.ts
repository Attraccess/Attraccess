import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/**
 * ATT-294 / ATT-834: HeroUI identifies a form field purely by its fill, and
 * `--field-background` is the same value as `--surface`. A field inside a Card is
 * therefore its container's exact colour (measured 1.00:1) — invisible until focus
 * paints the ring. The rule has regressed twice (ATT-371, ATT-379); this is the guard.
 *
 * This lives here rather than in ESLint on purpose. Every regression so far put the
 * Card and the field in *different files* (`<Card><ChangeUsernameForm /></Card>`), which
 * a per-file lint rule cannot see. So the check resolves locally-imported components
 * across files, and same-file variables that hold JSX.
 *
 * Fields inside a modal/drawer are exempt even under a Card, because the dialog portals
 * to <body> and renders on the overlay surface, not the Card's.
 *
 * `generators` lists the projects scanned here under implicitDependencies, so `nx affected`
 * runs this whenever one of them changes — otherwise the guard would never fire in CI.
 */

// typescript@7's package exports no longer expose the classic compiler API to the type
// system, but it is still there at runtime. Require it untyped rather than pull in a
// second parser just for this check.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ts = require('typescript');

/** Loose stand-in for ts.Node — the typed API is unavailable, see above. */
type Node = {
  kind: number;
  forEachChild: (visit: (child: Node) => void) => void;
  getStart: (source: Node) => number;
  [key: string]: unknown;
};

const ROOT = path.resolve(__dirname, '..', '..', '..');
const SCAN_DIRS = ['apps', 'libs'];
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', 'managed_components', 'public']);

const FIELD_PRIMITIVES = new Set([
  'TextField',
  'NumberField',
  'SearchField',
  'Select',
  'ComboBox',
  'Textarea',
  'TextArea',
  'DateField',
  'TimeField',
  'DatePicker',
  'Input',
  'InputGroup',
]);

/**
 * Components that portal their children to <body>, so their subtree renders on the overlay
 * surface and never on the Card. Matched by suffix so wrappers count too — `StandardModal`,
 * `RabbitmqPermissionsModal`, `DeviceInfoDrawer`.
 */
const isPortal = (tag: string) => /(?:Modal|Drawer|Dialog|Popover|Tooltip)$/.test(tag);

/**
 * Card-wrapped fields that are deliberately left as they are.
 * Keys are `<repo-relative path>:<line>`; add an entry only with a reason.
 */
const ALLOWLIST = new Map<string, string>();

function listTsxFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listTsxFiles(full, out);
    else if (entry.name.endsWith('.tsx')) out.push(full);
  }
  return out;
}

const sourceCache = new Map<string, Node>();

function parse(file: string): Node {
  let source = sourceCache.get(file);
  if (!source) {
    const text = fs.readFileSync(file, 'utf-8');
    source = ts.createSourceFile(file, text, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX) as Node;
    sourceCache.set(file, source);
  }
  return source;
}

const isJsx = (node: Node): boolean => ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node);

/** `Card.Content` -> `Card`, `TextField` -> `TextField`. */
function tagOf(node: Node): string {
  let name = ts.isJsxElement(node) ? (node.openingElement as Node).tagName : node.tagName;
  while (ts.isPropertyAccessExpression(name)) name = (name as Node).expression;
  return ts.isIdentifier(name) ? ((name as Node).text as string) : '';
}

/** Local component name -> resolved absolute file path, for relative imports only. */
function localImports(source: Node): Map<string, string> {
  const map = new Map<string, string>();
  for (const statement of source.statements as Node[]) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause) continue;
    const specifier = (statement.moduleSpecifier as Node).text as string;
    if (!specifier.startsWith('.')) continue;
    const resolved = resolveModule(path.dirname(source.fileName as string), specifier);
    if (!resolved) continue;

    const clause = statement.importClause as Node;
    if (clause.name) map.set((clause.name as Node).text as string, resolved);
    if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const element of (clause.namedBindings as Node).elements as Node[]) {
        map.set((element.name as Node).text as string, resolved);
      }
    }
  }
  return map;
}

function resolveModule(fromDir: string, specifier: string): string | null {
  const base = path.resolve(fromDir, specifier);
  for (const candidate of [`${base}.tsx`, `${base}.ts`, path.join(base, 'index.tsx'), path.join(base, 'index.ts')]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/** Walks `node`, skipping portaled subtrees, calling `visit` on every JSX element below it. */
function walkJsx(node: Node, visit: (element: Node) => void): void {
  node.forEachChild((child) => {
    if (isJsx(child)) {
      if (isPortal(tagOf(child))) return;
      visit(child);
    }
    walkJsx(child, visit);
  });
}

const rendersFieldCache = new Map<string, boolean>();

/** Does this module render a HeroUI field outside a portal — directly or via a local component? */
function rendersField(file: string, seen = new Set<string>()): boolean {
  const cached = rendersFieldCache.get(file);
  if (cached !== undefined) return cached;
  if (seen.has(file)) return false; // import cycle
  seen.add(file);

  const source = parse(file);
  const imports = localImports(source);
  let found = false;

  walkJsx(source, (element) => {
    if (found) return;
    const tag = tagOf(element);
    if (FIELD_PRIMITIVES.has(tag)) found = true;
    else {
      const imported = imports.get(tag);
      if (imported && rendersField(imported, seen)) found = true;
    }
  });

  rendersFieldCache.set(file, found);
  return found;
}

interface Violation {
  location: string;
  detail: string;
}

function findViolations(file: string): Violation[] {
  const source = parse(file);
  const imports = localImports(source);
  const violations: Violation[] = [];

  /** Same-file `const body = <div>…</div>`, so `<Card.Content>{body}</Card.Content>` is not a blind spot. */
  const jsxVariables = new Map<string, Node>();
  const collectVariables = (node: Node): void => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
      jsxVariables.set((node.name as Node).text as string, node.initializer as Node);
    }
    node.forEachChild(collectVariables);
  };
  collectVariables(source);

  const report = (node: Node, detail: string) => {
    const { line } = ts.getLineAndCharacterOfPosition(source, node.getStart(source));
    violations.push({ location: `${path.relative(ROOT, file)}:${line + 1}`, detail });
  };

  const scanCardSubtree = (node: Node, expanded: Set<string>): void => {
    walkJsx(node, (element) => {
      const tag = tagOf(element);
      if (FIELD_PRIMITIVES.has(tag)) return report(element, `<${tag}> renders directly inside a <Card>`);

      const imported = imports.get(tag);
      if (imported && rendersField(imported)) {
        report(element, `<${tag}> (${path.relative(ROOT, imported)}) renders a field inside a <Card>`);
      }
    });

    // `{body}`, where body is a same-file variable holding JSX.
    const expandExpressions = (current: Node): void => {
      current.forEachChild((child) => {
        if (isJsx(child) && isPortal(tagOf(child))) return;
        if (ts.isJsxExpression(child) && child.expression && ts.isIdentifier(child.expression)) {
          const name = (child.expression as Node).text as string;
          const initializer = jsxVariables.get(name);
          if (initializer && !expanded.has(name)) {
            expanded.add(name);
            scanCardSubtree(initializer, expanded);
          }
        }
        expandExpressions(child);
      });
    };
    expandExpressions(node);
  };

  walkJsx(source, (element) => {
    if (tagOf(element) === 'Card') scanCardSubtree(element, new Set());
  });

  // `Card` and `Card.Content` both scan as Card roots, so the same field is reached twice.
  const seen = new Set<string>();
  return violations.filter((violation) => !seen.has(violation.location) && seen.add(violation.location));
}

describe('form fields are not wrapped in Cards (ATT-294 / ATT-834)', () => {
  // A guard that is silently disabled looks exactly like a guard with nothing to report —
  // which is how the previous ESLint attempt passed CI while doing nothing. So prove it fires.
  it('flags a field reached through an imported component, and not one behind a portal', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'att834-'));
    fs.writeFileSync(
      path.join(dir, 'ChangeUsernameForm.tsx'),
      `import { TextField } from '@heroui/react';
       export const ChangeUsernameForm = () => <TextField />;`,
    );
    fs.writeFileSync(
      path.join(dir, 'EditModal.tsx'),
      `import { StandardModal, TextField } from '../shared';
       export const EditModal = () => <StandardModal><TextField /></StandardModal>;`,
    );
    fs.writeFileSync(
      path.join(dir, 'page.tsx'),
      `import { Card } from '@heroui/react';
       import { ChangeUsernameForm } from './ChangeUsernameForm';
       import { EditModal } from './EditModal';
       export const Page = () => (
         <Card>
           <Card.Content>
             <ChangeUsernameForm />
             <EditModal />
           </Card.Content>
         </Card>
       );`,
    );

    const violations = findViolations(path.join(dir, 'page.tsx'));
    fs.rmSync(dir, { recursive: true, force: true });

    expect(violations).toHaveLength(1);
    expect(violations[0].detail).toContain('<ChangeUsernameForm>');
  });

  it('finds no HeroUI field rendered on a Card surface', () => {
    const files = SCAN_DIRS.flatMap((dir) => listTsxFiles(path.join(ROOT, dir)));
    expect(files.length).toBeGreaterThan(100);

    const violations = files.flatMap(findViolations).filter((violation) => !ALLOWLIST.has(violation.location));

    expect(violations.map((v) => `${v.location} — ${v.detail}`).join('\n')).toBe('');
  });
});
