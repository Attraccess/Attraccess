import * as fs from 'fs';
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
 * `generators` lists the core projects scanned here under implicitDependencies, so
 * `nx affected` runs this whenever one of them changes — otherwise the guard would never
 * fire in CI. Plugin projects are deliberately NOT listed (core tooling must not know
 * plugin names); the CI `plugins` job runs this guard whenever any plugin is affected.
 * Hardware boards are not scanned, and a test asserts every scanned non-plugin project
 * is listed, so the two cannot drift apart silently.
 *
 * KNOWN GAPS — a green run means "none of the shapes below", not "no field on a Card surface".
 * None of these hides a violation today; they are listed so the next reader does not over-trust
 * a pass. Each is a resolution gap, not a detection one:
 *
 */

// typescript@7's package exports no longer expose the classic compiler API to the type
// system, but it is still there at runtime. Require it untyped rather than pull in a
// second parser just for this check.
export const ts = require('typescript');

/** Loose stand-in for ts.Node — the typed API is unavailable, see above. */
export type Node = {
  kind: number;
  forEachChild: (visit: (child: Node) => void) => void;
  getStart: (source: Node) => number;
  [key: string]: unknown;
};

export const ROOT = path.resolve(__dirname, '..', '..', '..');

export const SCAN_DIRS = ['apps', 'libs'];

export const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', 'managed_components', 'public']);

export const FIELD_PRIMITIVES = new Set([
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
 * `PermissionsModal`, `DeviceInfoDrawer`.
 */
export const isPortal = (tag: string) => /(?:Modal|Drawer|Dialog|Popover|Tooltip)$/.test(tag);

/**
 * Card-wrapped fields that are deliberately left as they are.
 * Keys are `<repo-relative path>:<line>`; add an entry only with a reason.
 */
export const ALLOWLIST = new Map<string, string>();

export function listTsxFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listTsxFiles(full, out);
    else if (entry.name.endsWith('.tsx')) out.push(full);
  }
  return out;
}

/** The Nx project that owns `file`, resolved from the nearest ancestor `project.json`. */
export function owningProject(file: string): { name: string; tags: string[] } | null {
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

/** The files the guard scans: every `.tsx` under `apps`/`libs`. */
export function scannedTsxFiles(): string[] {
  return SCAN_DIRS.flatMap((dir) => listTsxFiles(path.join(ROOT, dir)));
}

export const sourceCache = new Map<string, Node>();

export function parse(file: string): Node {
  let source = sourceCache.get(file);
  if (!source) {
    const text = fs.readFileSync(file, 'utf-8');
    source = ts.createSourceFile(file, text, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX) as Node;
    sourceCache.set(file, source);
  }
  return source;
}

export const isJsx = (node: Node): boolean => ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node);

/** `Card.Content` -> `Card`, `TextField` -> `TextField`. */
export function tagOf(node: Node): string {
  let name = ts.isJsxElement(node) ? (node.openingElement as Node).tagName : node.tagName;
  while (ts.isPropertyAccessExpression(name)) name = (name as Node).expression;
  return ts.isIdentifier(name) ? ((name as Node).text as string) : '';
}

/** Workspace aliases from tsconfig.base.json compilerOptions.paths, cached. */
export let aliasPaths: Map<string, string> | null = null;

export function loadAliasPaths(): Map<string, string> {
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

export interface Import {
  file: string;
  name: string;
}

/** Local component name -> source export, for relative and workspace-alias imports. */
export function localImports(source: Node): Map<string, Import> {
  const map = new Map<string, Import>();
  for (const statement of source.statements as Node[]) {
    if (!ts.isImportDeclaration(statement) || !statement.importClause) continue;
    const specifier = (statement.moduleSpecifier as Node).text as string;
    const resolved = resolveModule(path.dirname(source.fileName as string), specifier);
    if (!resolved) continue;

    const clause = statement.importClause as Node;
    if (clause.name) map.set((clause.name as Node).text as string, { file: resolved, name: 'default' });
    if (clause.namedBindings && ts.isNamedImports(clause.namedBindings)) {
      for (const element of (clause.namedBindings as Node).elements as Node[]) {
        map.set((element.name as Node).text as string, {
          file: resolved,
          name: element.propertyName
            ? ((element.propertyName as Node).text as string)
            : ((element.name as Node).text as string),
        });
      }
    }
  }
  return map;
}

export function resolveModule(fromDir: string, specifier: string): string | null {
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
export function walkJsx(node: Node, visit: (element: Node) => void): void {
  node.forEachChild((child) => {
    if (isJsx(child)) {
      if (isPortal(tagOf(child))) return;
      visit(child);
    }
    walkJsx(child, visit);
  });
}

/**
 * Walks `node`, skipping portaled subtrees, calling `visit` on the identifier of every
 * `{someName}` expression. `<div>{field}</div>` is a JsxExpression, not a JsxElement, so
 * `walkJsx` never sees the reference.
 */
export function walkJsxExpressionIdentifiers(node: Node, visit: (name: string) => void): void {
  node.forEachChild((child) => {
    if (isJsx(child) && isPortal(tagOf(child))) return;
    if (ts.isJsxExpression(child) && child.expression && ts.isIdentifier(child.expression)) {
      visit((child.expression as Node).text as string);
    }
    walkJsxExpressionIdentifiers(child, visit);
  });
}

/**
 * Identifiers passed as arguments to a call, through nesting — `memo(Base)`,
 * `memo(forwardRef(Base))`. The declaration of an HOC-wrapped export holds a call, not JSX,
 * so the wrapped component is reachable only as an argument.
 */
export function callArgumentIdentifiers(node: Node, out: string[] = []): string[] {
  if (ts.isIdentifier(node)) {
    out.push(node.text as string);
  } else if (ts.isCallExpression(node)) {
    for (const argument of node.arguments as Node[]) callArgumentIdentifiers(argument, out);
  }
  return out;
}
