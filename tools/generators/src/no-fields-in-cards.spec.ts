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
 * Hardware boards are not scanned, and a test asserts every scanned project is listed, so
 * the two cannot drift apart silently.
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

/** The Nx project that owns `file`, resolved from the nearest ancestor `project.json`. */
function owningProject(file: string): { name: string; tags: string[] } | null {
  let dir = path.dirname(file);
  while (true) {
    const projectJson = path.join(dir, 'project.json');
    if (fs.existsSync(projectJson)) {
      const raw = JSON.parse(fs.readFileSync(projectJson, 'utf-8')) as { name?: string; tags?: string[] };
      return { name: raw.name ?? path.basename(dir), tags: raw.tags ?? [] };
    }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * The files the guard scans: every `.tsx` under `apps`/`libs` except hardware boards
 * (tscircuit definitions tagged `scope:hardware`), which never render HeroUI fields.
 */
function scannedTsxFiles(): string[] {
  return SCAN_DIRS.flatMap((dir) => listTsxFiles(path.join(ROOT, dir))).filter((file) => !owningProject(file)?.tags.includes('scope:hardware'));
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

/** Workspace aliases from tsconfig.base.json compilerOptions.paths, cached. */
let aliasPaths: Map<string, string> | null = null;

function loadAliasPaths(): Map<string, string> {
  if (aliasPaths) return aliasPaths;
  aliasPaths = new Map();
  const tsconfigPath = path.join(ROOT, 'tsconfig.base.json');
  if (!fs.existsSync(tsconfigPath)) return aliasPaths;
  const raw = JSON.parse(fs.readFileSync(tsconfigPath, 'utf-8')) as {
    compilerOptions?: { paths?: Record<string, string[]> };
  };
  for (const [alias, targets] of Object.entries(raw.compilerOptions?.paths ?? {})) {
    for (const target of targets) {
      if (!target.includes('*')) aliasPaths.set(alias, path.resolve(ROOT, target));
    }
  }
  return aliasPaths;
}

/** Local component name -> resolved absolute file path, for relative and workspace-alias imports. */
function localImports(source: Node): Map<string, string> {
  const map = new Map<string, string>();
  for (const statement of source.statements as Node[]) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause) continue;
    const specifier = (statement.moduleSpecifier as Node).text as string;
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
  if (specifier.startsWith('.')) {
    const base = path.resolve(fromDir, specifier);
    for (const candidate of [`${base}.tsx`, `${base}.ts`, path.join(base, 'index.tsx'), path.join(base, 'index.ts')]) {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
    }
    return null;
  }
  const aliasTarget = loadAliasPaths().get(specifier);
  return aliasTarget && fs.existsSync(aliasTarget) ? aliasTarget : null;
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

/** A component export, pinned to the module that declares it. */
interface Export {
  file: string;
  name: string;
}

/** Keyed `<file>#<export name>`, not by file — see `rendersField`. */
const rendersFieldCache = new Map<string, boolean>();

/** `export function Name` / `export class Name` / `export const Name` carry this modifier. */
function hasExportModifier(node: Node): boolean {
  const modifiers = node.modifiers as Node[] | undefined;
  return !!modifiers && modifiers.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
}

/** The top-level declaration of `name` in `source`, exported or not. */
function findLocalDeclaration(source: Node, name: string): Node | null {
  for (const statement of source.statements as Node[]) {
    if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) {
      if (statement.name && (statement.name as Node).text === name) return statement;
    } else if (ts.isVariableStatement(statement)) {
      for (const decl of (statement.declarationList as Node).declarations as Node[]) {
        if (ts.isIdentifier(decl.name) && (decl.name as Node).text === name) return decl;
      }
    }
  }
  return null;
}

/**
 * The declaration `name` refers to in `source`, resolving `export { Local as Name }` back to
 * `Local`. Used to scope the field walk to one component rather than the whole module.
 */
function declarationOf(source: Node, name: string): Node | null {
  const direct = findLocalDeclaration(source, name);
  if (direct) return direct;
  for (const statement of source.statements as Node[]) {
    if (
      !ts.isExportDeclaration(statement) ||
      statement.moduleSpecifier ||
      !statement.exportClause ||
      !ts.isNamedExports(statement.exportClause)
    ) {
      continue;
    }
    for (const element of (statement.exportClause as Node).elements as Node[]) {
      if ((element.name as Node).text !== name) continue;
      const localName = element.propertyName ? ((element.propertyName as Node).text as string) : name;
      const decl = findLocalDeclaration(source, localName);
      if (decl) return decl;
    }
  }
  return null;
}

/** Does `source` declare `name` as a local export, as opposed to re-exporting it? */
function definesLocally(source: Node, name: string): boolean {
  for (const statement of source.statements as Node[]) {
    if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) {
      if (hasExportModifier(statement) && statement.name && (statement.name as Node).text === name) return true;
    } else if (ts.isVariableStatement(statement)) {
      if (hasExportModifier(statement)) {
        for (const decl of (statement.declarationList as Node).declarations as Node[]) {
          if (ts.isIdentifier(decl.name) && (decl.name as Node).text === name) return true;
        }
      }
    } else if (
      ts.isExportDeclaration(statement) &&
      !statement.moduleSpecifier &&
      statement.exportClause &&
      ts.isNamedExports(statement.exportClause)
    ) {
      for (const element of (statement.exportClause as Node).elements as Node[]) {
        if ((element.name as Node).text === name) return true;
      }
    }
  }
  return false;
}

/**
 * The set of module files that provide the export `name` from `file`, following re-export
 * barrels (`export * from` / `export { x } from`). Resolution is name-aware: a barrel that
 * re-exports both fields and non-fields (e.g. `@attraccess/plugins-frontend-ui`) must resolve
 * the specific name, or every consumer of that barrel would read as a field.
 */
function resolveExport(file: string, name: string, seen = new Set<string>()): Export[] {
  const key = `${file}#${name}`;
  if (seen.has(key)) return [];
  seen.add(key);
  const source = parse(file);
  const fromDir = path.dirname(file);
  const results: Export[] = [];

  for (const statement of source.statements as Node[]) {
    if (!ts.isExportDeclaration(statement) || !statement.moduleSpecifier) continue;
    const specifier = (statement.moduleSpecifier as Node).text as string;
    const target = resolveModule(fromDir, specifier);
    if (!target) continue;

    const clause = statement.exportClause as Node | undefined;
    if (!clause) {
      // `export * from './X'` — name passes through unchanged; the leaf must define it.
      results.push(...resolveExport(target, name, seen));
    } else if (ts.isNamedExports(clause)) {
      for (const element of clause.elements as Node[]) {
        if ((element.name as Node).text !== name) continue;
        const sourceName = element.propertyName ? ((element.propertyName as Node).text as string) : name;
        results.push(...resolveExport(target, sourceName, seen));
      }
    }
    // `export * as ns from './X'` does not re-export `name` directly; skip.
  }

  if (definesLocally(source, name)) results.push({ file, name });
  return results;
}

/**
 * Does the component `name` in `file` render a HeroUI field outside a portal — directly, via a
 * same-file helper component, or via a locally imported one (resolved name-aware through
 * re-export barrels)?
 *
 * Scoped to the one declaration, not the whole module: a file that exports both a field
 * component and a plain one (`ResourceSelector` next to `ListboxWrapper`) would otherwise
 * report the plain one as rendering a field. Naming an innocent component is the failure this
 * guard can least afford — a misattributed cause is what made the previous ESLint attempt look
 * wrong. Hence the cache key carries the name too.
 *
 * `seen` guards against import cycles; `truncated` is set when the walk was cut short by one,
 * because a `false` produced under truncation is unreliable and must not be cached.
 */
function rendersField(
  file: string,
  name: string,
  seen = new Set<string>(),
  truncated: { hit: boolean } = { hit: false },
): boolean {
  const key = `${file}#${name}`;
  const cached = rendersFieldCache.get(key);
  if (cached !== undefined) return cached;
  if (seen.has(key)) {
    truncated.hit = true;
    return false;
  }
  seen.add(key);

  const source = parse(file);
  const declaration = declarationOf(source, name);
  if (!declaration) return false;
  const imports = localImports(source);
  let found = false;

  walkJsx(declaration, (element) => {
    if (found) return;
    const tag = tagOf(element);
    if (FIELD_PRIMITIVES.has(tag)) {
      found = true;
      return;
    }
    const childTruncated = { hit: false };
    const imported = imports.get(tag);
    if (imported) {
      for (const leaf of resolveExport(imported, tag)) {
        if (rendersField(leaf.file, leaf.name, seen, childTruncated)) {
          found = true;
          return;
        }
      }
    } else if (findLocalDeclaration(source, tag)) {
      // A helper component declared beside this one — `const Inner = () => <TextField />`
      // used by the exported component. Scoping to the declaration would miss it otherwise.
      if (rendersField(file, tag, seen, childTruncated)) {
        found = true;
        return;
      }
    }
    if (childTruncated.hit) truncated.hit = true;
  });

  if (found || !truncated.hit) rendersFieldCache.set(key, found);
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
    const checkElement = (element: Node): void => {
      const tag = tagOf(element);
      if (FIELD_PRIMITIVES.has(tag)) {
        report(element, `<${tag}> renders directly inside a <Card>`);
        return;
      }
      const imported = imports.get(tag);
      if (!imported) return;
      for (const leaf of resolveExport(imported, tag)) {
        if (rendersField(leaf.file, leaf.name)) {
          report(element, `<${tag}> (${path.relative(ROOT, leaf.file)}) renders a field inside a <Card>`);
          return;
        }
      }
    };

    walkJsx(node, checkElement);

    // `{body}`, where body is a same-file variable holding JSX. `walkJsx` visits only
    // children, so a variable that holds a bare field is its own root and is checked here
    // before descending.
    const expandExpressions = (current: Node): void => {
      current.forEachChild((child) => {
        if (isJsx(child) && isPortal(tagOf(child))) return;
        if (ts.isJsxExpression(child) && child.expression && ts.isIdentifier(child.expression)) {
          const name = (child.expression as Node).text as string;
          const initializer = jsxVariables.get(name);
          if (initializer && !expanded.has(name)) {
            expanded.add(name);
            if (isJsx(initializer)) checkElement(initializer);
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

  it('flags a field behind a barrel re-export, and not a non-field from the same barrel', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'att834-'));
    fs.writeFileSync(
      path.join(dir, 'UserSearch.tsx'),
      `import { TextField } from '@heroui/react';
       export function UserSearch() { return <TextField />; }`,
    );
    fs.writeFileSync(
      path.join(dir, 'Avatar.tsx'),
      `export function Avatar() { return <div />; }`,
    );
    fs.writeFileSync(
      path.join(dir, 'barrel.ts'),
      `export * from './UserSearch';
       export * from './Avatar';`,
    );
    fs.writeFileSync(
      path.join(dir, 'page.tsx'),
      `import { Card } from '@heroui/react';
       import { UserSearch, Avatar } from './barrel';
       export const Page = () => (
         <Card>
           <Card.Content>
             <UserSearch />
             <Avatar />
           </Card.Content>
         </Card>
       );`,
    );

    const violations = findViolations(path.join(dir, 'page.tsx'));
    fs.rmSync(dir, { recursive: true, force: true });

    expect(violations).toHaveLength(1);
    expect(violations[0].detail).toContain('<UserSearch>');
  });

  it('does not taint a plain component exported beside a field component in the same module', () => {
    // The shape of ResourceSelector.tsx (ListboxWrapper next to ResourceSelector) and of
    // SerialConfigurator/Auth (AttractapSerialCommProvider next to AttractapSerialCommGate).
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'att834-'));
    fs.writeFileSync(
      path.join(dir, 'ResourceSelector.tsx'),
      `import { TextField } from '@heroui/react';
       export const ListboxWrapper = ({ children }) => <div>{children}</div>;
       const Hint = () => <TextField />;
       export const ResourceSelector = () => <><Hint /><TextField /></>;`,
    );
    fs.writeFileSync(
      path.join(dir, 'page.tsx'),
      `import { Card } from '@heroui/react';
       import { ListboxWrapper, ResourceSelector } from './ResourceSelector';
       export const Page = () => (
         <Card>
           <Card.Content>
             <ListboxWrapper />
             <ResourceSelector />
           </Card.Content>
         </Card>
       );`,
    );

    const violations = findViolations(path.join(dir, 'page.tsx'));
    fs.rmSync(dir, { recursive: true, force: true });

    expect(violations).toHaveLength(1);
    expect(violations[0].detail).toContain('<ResourceSelector>');
  });

  it('follows a same-file helper component that renders the field', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'att834-'));
    fs.writeFileSync(
      path.join(dir, 'Form.tsx'),
      `import { TextField } from '@heroui/react';
       const Inner = () => <TextField />;
       export const Form = () => <Inner />;`,
    );
    fs.writeFileSync(
      path.join(dir, 'page.tsx'),
      `import { Card } from '@heroui/react';
       import { Form } from './Form';
       export const Page = () => <Card><Card.Content><Form /></Card.Content></Card>;`,
    );

    const violations = findViolations(path.join(dir, 'page.tsx'));
    fs.rmSync(dir, { recursive: true, force: true });

    expect(violations).toHaveLength(1);
    expect(violations[0].detail).toContain('<Form>');
  });

  it('flags a field held directly in a same-file JSX variable', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'att834-'));
    fs.writeFileSync(
      path.join(dir, 'page.tsx'),
      `import { Card, TextField } from '@heroui/react';
       const body = <TextField />;
       export const Page = () => (
         <Card>
           <Card.Content>{body}</Card.Content>
         </Card>
       );`,
    );

    const violations = findViolations(path.join(dir, 'page.tsx'));
    fs.rmSync(dir, { recursive: true, force: true });

    expect(violations).toHaveLength(1);
    expect(violations[0].detail).toContain('<TextField>');
  });

  it('does not cache a false result computed under a truncated import cycle', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'att834-'));
    fs.writeFileSync(
      path.join(dir, 'A.tsx'),
      `import { B } from './B';
       import { TextField } from '@heroui/react';
       export const A = () => <><B /><TextField /></>;`,
    );
    fs.writeFileSync(path.join(dir, 'B.tsx'), `import { A } from './A'; export const B = () => <A />;`);
    fs.writeFileSync(
      path.join(dir, 'page.tsx'),
      `import { Card } from '@heroui/react';
       import { B } from './B';
       export const Page = () => <Card><Card.Content><B /></Card.Content></Card>;`,
    );

    // Warm A first: the A -> B -> A cycle truncates inside B, and B's `false` must not be cached.
    rendersField(path.join(dir, 'A.tsx'), 'A');
    const violations = findViolations(path.join(dir, 'page.tsx'));
    fs.rmSync(dir, { recursive: true, force: true });

    expect(violations).toHaveLength(1);
    expect(violations[0].detail).toContain('<B>');
  });

  it('finds no HeroUI field rendered on a Card surface', () => {
    const files = scannedTsxFiles();
    expect(files.length).toBeGreaterThan(100);

    const violations = files.flatMap(findViolations).filter((violation) => !ALLOWLIST.has(violation.location));

    expect(violations.map((v) => `${v.location} — ${v.detail}`).join('\n')).toBe('');
  });

  it('scans only projects wired into nx affected via generators.implicitDependencies', () => {
    const generatorsJson = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'tools', 'generators', 'project.json'), 'utf-8'),
    ) as { implicitDependencies?: string[] };
    const wired = new Set(generatorsJson.implicitDependencies ?? []);

    const owners = new Set<string>();
    for (const file of scannedTsxFiles()) {
      const project = owningProject(file);
      if (project) owners.add(project.name);
    }

    const unwired = [...owners].filter((name) => !wired.has(name));
    expect(unwired.join('\n')).toBe('');
  });
});
