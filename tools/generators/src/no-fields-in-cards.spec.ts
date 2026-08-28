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
 *
 * KNOWN GAPS — a green run means "none of the shapes below", not "no field on a Card surface".
 * None of these hides a violation today; they are listed so the next reader does not over-trust
 * a pass. Each is a resolution gap, not a detection one:
 *
 */

// typescript@7's package exports no longer expose the classic compiler API to the type
// system, but it is still there at runtime. Require it untyped rather than pull in a
// second parser just for this check.
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

interface Import {
  file: string;
  name: string;
}

/** Local component name -> source export, for relative and workspace-alias imports. */
function localImports(source: Node): Map<string, Import> {
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
          name: element.propertyName ? ((element.propertyName as Node).text as string) : ((element.name as Node).text as string),
        });
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

/**
 * Walks `node`, skipping portaled subtrees, calling `visit` on the identifier of every
 * `{someName}` expression. `<div>{field}</div>` is a JsxExpression, not a JsxElement, so
 * `walkJsx` never sees the reference.
 */
function walkJsxExpressionIdentifiers(node: Node, visit: (name: string) => void): void {
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
function callArgumentIdentifiers(node: Node, out: string[] = []): string[] {
  if (ts.isIdentifier(node)) {
    out.push(node.text as string);
  } else if (ts.isCallExpression(node)) {
    for (const argument of node.arguments as Node[]) callArgumentIdentifiers(argument, out);
  }
  return out;
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
    if (name === 'default' && ts.isExportAssignment(statement) && !statement.isExportEquals) {
      const expression = statement.expression as Node;
      return ts.isIdentifier(expression) ? findLocalDeclaration(source, expression.text as string) : expression;
    }
    if (
      name === 'default' &&
      (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) &&
      (statement.modifiers as Node[] | undefined)?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword)
    ) {
      return statement;
    }
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
    if (
      name === 'default' &&
      ((ts.isExportAssignment(statement) && !statement.isExportEquals) ||
        ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) &&
          (statement.modifiers as Node[] | undefined)?.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword)))
    ) {
      return true;
    }
    if (ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) {
      if (hasExportModifier(statement) && statement.name && (statement.name as Node).text === name) return true;
    } else if (ts.isVariableStatement(statement)) {
      if (hasExportModifier(statement)) {
        for (const decl of (statement.declarationList as Node).declarations as Node[]) {
          if (ts.isIdentifier(decl.name) && (decl.name as Node).text === name) return true;
        }
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
  const imports = localImports(source);
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

  // `import { X } from './x'; export { X };` is a re-export just like
  // `export { X } from './x'`, despite its export declaration lacking a module specifier.
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
      const imported = imports.get(localName);
      if (imported) results.push(...resolveExport(imported.file, imported.name, seen));
      else if (findLocalDeclaration(source, localName)) results.push({ file, name });
    }
  }

  if (definesLocally(source, name)) results.push({ file, name });
  return results;
}

/**
 * Where `<Tag>` used in `file` is declared: the leaf modules behind a local import, or `file`
 * itself when the component sits beside its user.
 *
 * One resolver for both the Card entry point and the recursive walk. They were written
 * separately and drifted twice — each time leaving one side blind to a shape the other
 * handled (a same-file component under a Card; an imported component behind `memo`).
 */
function resolveComponent(file: string, source: Node, imports: Map<string, Import>, name: string): Export[] {
  const imported = imports.get(name);
  if (imported) return resolveExport(imported.file, imported.name);
  return findLocalDeclaration(source, name) ? [{ file, name }] : [];
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

  /** Follow a name — a helper component, an HOC argument, or a JSX variable, local or imported. */
  const follow = (identifier: string): void => {
    if (found) return;
    const childTruncated = { hit: false };
    for (const leaf of resolveComponent(file, source, imports, identifier)) {
      if (rendersField(leaf.file, leaf.name, seen, childTruncated)) {
        found = true;
        return;
      }
    }
    if (childTruncated.hit) truncated.hit = true;
  };

  // `export const Form = memo(FormBase)` — the declaration holds a call, not JSX, so the
  // wrapped component is reachable only through the call's arguments.
  const initializer = (declaration.initializer as Node | undefined) ?? (ts.isCallExpression(declaration) ? declaration : undefined);
  if (initializer && ts.isCallExpression(initializer)) {
    for (const identifier of callArgumentIdentifiers(initializer)) follow(identifier);
  }

  walkJsx(declaration, (element) => {
    if (found) return;
    const tag = tagOf(element);
    if (FIELD_PRIMITIVES.has(tag)) {
      found = true;
      return;
    }
    follow(tag);
  });

  // `const field = <TextField />` referenced as `<div>{field}</div>`.
  walkJsxExpressionIdentifiers(declaration, follow);

  if (found || !truncated.hit) rendersFieldCache.set(key, found);
  return found;
}

interface Violation {
  location: string;
  detail: string;
}

const wrapsChildrenCache = new Map<string, boolean>();

/** Is there a `{children}` / `{props.children}` slot anywhere below `node`? */
function containsChildrenSlot(node: Node): boolean {
  let found = false;
  const visit = (child: Node): void => {
    if (found) return;
    if (ts.isJsxExpression(child) && child.expression) {
      const expression = child.expression as Node;
      if (ts.isIdentifier(expression) && (expression.text as string) === 'children') {
        found = true;
        return;
      }
      if (
        ts.isPropertyAccessExpression(expression) &&
        ts.isIdentifier(expression.name) &&
        ((expression.name as Node).text as string) === 'children'
      ) {
        found = true;
        return;
      }
    }
    child.forEachChild(visit);
  };
  node.forEachChild(visit);
  return found;
}

/**
 * Does `name` render its `{children}` inside a `<Card>`? Such a component *is* a Card surface
 * for its callers: `<SectionCard><TextField /></SectionCard>` puts a field on a Card exactly as
 * `<Card><TextField /></Card>` does, but a literal-tag check never sees it.
 *
 * `{children}` must be inside the Card, not merely a Card somewhere in the module — a component
 * that renders a Card of its own and puts children beside it is not a Card surface, and treating
 * it as one would report fields that never touch a Card.
 */
function wrapsChildrenInCard(
  file: string,
  name: string,
  seen = new Set<string>(),
  truncated: { hit: boolean } = { hit: false },
): boolean {
  const key = `${file}#${name}`;
  const cached = wrapsChildrenCache.get(key);
  if (cached !== undefined) return cached;
  // As in `rendersField`. The cut suppresses a cyclic *path*, but the `false` it returns is
  // folded into the descendant's aggregate — and for that descendant the route through the
  // still-in-progress ancestor is not a cycle and may well end at a `<Card>`. Caching it
  // poisons the descendant permanently, so the answer depends on file scan order.
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
  if (ts.isCallExpression(declaration)) {
    for (const identifier of callArgumentIdentifiers(declaration)) {
      const childTruncated = { hit: false };
      for (const leaf of resolveComponent(file, source, imports, identifier)) {
        if (wrapsChildrenInCard(leaf.file, leaf.name, seen, childTruncated)) {
          found = true;
          break;
        }
      }
      if (childTruncated.hit) truncated.hit = true;
      if (found) break;
    }
  }
  const visit = (node: Node): void => {
    if (found) return;
    if (isJsx(node) && containsChildrenSlot(node)) {
      const tag = tagOf(node);
      if (tag === 'Card') {
        found = true;
        return;
      }
      // A wrapper of a wrapper is still a Card surface: `PanelCard` handing its `{children}`
      // to `SectionCard` puts them on the same Card, one hop further out.
      const childTruncated = { hit: false };
      for (const leaf of resolveComponent(file, source, imports, tag)) {
        if (wrapsChildrenInCard(leaf.file, leaf.name, seen, childTruncated)) {
          found = true;
          return;
        }
      }
      if (childTruncated.hit) truncated.hit = true;
    }
    node.forEachChild(visit);
  };
  visit(declaration);

  if (found || !truncated.hit) wrapsChildrenCache.set(key, found);
  return found;
}

/**
 * The initializer bound to `name` as seen from `node`, resolved outwards through enclosing
 * scopes — `const body = <div />` in the component holding the Card, not the `const body` in
 * a sibling component further down the file.
 *
 * A file-wide map keyed by bare name (which this was) lets one component's variable answer for
 * another's, reporting a field at a line no Card ever contained. Same failure the `<file>#<name>`
 * cache key exists to prevent, arriving by the variable path instead of the export path.
 */
function lookupVariable(node: Node, name: string): Node | null {
  for (let scope = node.parent as Node | undefined; scope; scope = scope.parent as Node | undefined) {
    // Blocks and the source file are the only `const` scopes that matter here.
    const statements = scope.statements as Node[] | undefined;
    if (!statements) continue;
    for (const statement of statements) {
      if (ts.isFunctionDeclaration(statement) && statement.name && (statement.name as Node).text === name) return statement;
      if (!ts.isVariableStatement(statement)) continue;
      for (const declaration of (statement.declarationList as Node).declarations as Node[]) {
        if (ts.isIdentifier(declaration.name) && (declaration.name as Node).text === name && declaration.initializer) {
          return declaration.initializer as Node;
        }
      }
    }
  }
  return null;
}

function findViolations(file: string): Violation[] {
  const source = parse(file);
  const imports = localImports(source);
  const violations: Violation[] = [];

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
      for (const leaf of resolveComponent(file, source, imports, tag)) {
        if (rendersField(leaf.file, leaf.name)) {
          const where = leaf.file === file ? 'same file' : path.relative(ROOT, leaf.file);
          report(element, `<${tag}> (${where}) renders a field inside a <Card>`);
          return;
        }
      }
    };

    walkJsx(node, checkElement);

    // JSX tags are discovered by `walkJsx`, but JSX expression slots can also call a helper
    // or select one branch. Follow their identifiers so `{renderBody()}` and conditional
    // branches receive the same component and variable resolution as JSX tags.
    const expandExpressions = (current: Node): void => {
      current.forEachChild((child) => {
        if (isJsx(child) && isPortal(tagOf(child))) return;
        if (ts.isJsxExpression(child) && child.expression) {
          const followExpressionIdentifiers = (expression: Node): void => {
            // Nested JSX is handled by `walkJsx`; only its containing expression needs help.
            if (isJsx(expression)) return;
            if (ts.isIdentifier(expression)) {
              const name = expression.text as string;
              const initializer = lookupVariable(child, name);
              if (initializer && !expanded.has(name)) {
                expanded.add(name);
                // A JSX value needs its root checked before its children. A local helper
                // declaration is scanned in place so its returned JSX is included too.
                if (isJsx(initializer)) {
                  checkElement(initializer);
                  scanCardSubtree(initializer, expanded);
                  return;
                }
                scanCardSubtree(initializer, expanded);
              }
              if (!initializer) {
                for (const leaf of resolveComponent(file, source, imports, name)) {
                  if (rendersField(leaf.file, leaf.name)) {
                    const where = leaf.file === file ? 'same file' : path.relative(ROOT, leaf.file);
                    report(child, `{${name}} (${where}) renders a field inside a <Card>`);
                  }
                }
              }
            }
            expression.forEachChild(followExpressionIdentifiers);
          }
          followExpressionIdentifiers(child.expression as Node);
        }
        expandExpressions(child);
      });
    };
    expandExpressions(node);
  };

  walkJsx(source, (element) => {
    const tag = tagOf(element);
    if (tag === 'Card') {
      scanCardSubtree(element, new Set());
      return;
    }
    // `<SectionCard>` and friends are Card surfaces for whatever they are given.
    for (const leaf of resolveComponent(file, source, imports, tag)) {
      if (wrapsChildrenInCard(leaf.file, leaf.name)) {
        scanCardSubtree(element, new Set());
        return;
      }
    }
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

  it('follows an HOC-wrapped export to the component it wraps', () => {
    // `export const DocumentationEditor = memo(DocumentationEditorComponent)` — four
    // components in the tree have this shape. The declaration holds a call, not JSX.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'att834-'));
    fs.writeFileSync(
      path.join(dir, 'Form.tsx'),
      `import { memo } from 'react';
       import { TextField } from '@heroui/react';
       const FormBase = () => <TextField />;
       export const Form = memo(FormBase);`,
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

  it('flags a field reached through a component declared in the same file as the Card', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'att834-'));
    fs.writeFileSync(
      path.join(dir, 'page.tsx'),
      `import { Card, TextField } from '@heroui/react';
       const ProfileForm = () => <TextField />;
       export const Page = () => <Card><Card.Content><ProfileForm /></Card.Content></Card>;`,
    );

    const violations = findViolations(path.join(dir, 'page.tsx'));
    fs.rmSync(dir, { recursive: true, force: true });

    expect(violations).toHaveLength(1);
    expect(violations[0].detail).toContain('<ProfileForm>');
  });

  it('follows an HOC-wrapped export to a component imported from another file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'att834-'));
    fs.writeFileSync(
      path.join(dir, 'FormBase.tsx'),
      `import { TextField } from '@heroui/react';
       export const FormBase = () => <TextField />;`,
    );
    fs.writeFileSync(
      path.join(dir, 'Form.tsx'),
      `import { memo, forwardRef } from 'react';
       import { FormBase } from './FormBase';
       export const Form = memo(forwardRef(FormBase));`,
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

  it('follows a top-level JSX variable referenced from the exported component', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'att834-'));
    fs.writeFileSync(
      path.join(dir, 'Form.tsx'),
      `import { TextField } from '@heroui/react';
       const field = <TextField />;
       export const Form = () => <div>{field}</div>;`,
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

  it('follows default exports for field components and Card wrappers', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'att834-'));
    fs.writeFileSync(
      path.join(dir, 'Form.tsx'),
      `import { memo } from 'react';
       import { TextField } from '@heroui/react';
       const FormBase = () => <TextField />;
       export default memo(FormBase);`,
    );
    fs.writeFileSync(
      path.join(dir, 'SectionCard.tsx'),
      `import { memo } from 'react';
       import { Card } from '@heroui/react';
       const SectionCardBase = ({ children }) => <Card><Card.Content>{children}</Card.Content></Card>;
       export default memo(SectionCardBase);`,
    );
    fs.writeFileSync(
      path.join(dir, 'page.tsx'),
      `import { Card, TextField } from '@heroui/react';
       import Form from './Form';
       import SectionCard from './SectionCard';
       export const Page = () => <>
         <Card><Card.Content><Form /></Card.Content></Card>
         <SectionCard><TextField /></SectionCard>
       </>;`,
    );

    const violations = findViolations(path.join(dir, 'page.tsx'));
    fs.rmSync(dir, { recursive: true, force: true });

    expect(violations).toHaveLength(2);
    expect(violations.map((violation) => violation.detail).join()).toContain('<Form>');
    expect(violations.map((violation) => violation.detail).join()).toContain('<TextField>');
  });

  it('follows a barrel that re-exports a locally imported component', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'att834-'));
    fs.writeFileSync(
      path.join(dir, 'Form.tsx'),
      `import { TextField } from '@heroui/react';
       export const Form = () => <TextField />;`,
    );
    fs.writeFileSync(
      path.join(dir, 'barrel.ts'),
      `import { Form } from './Form';
       export { Form };`,
    );
    fs.writeFileSync(
      path.join(dir, 'page.tsx'),
      `import { Card } from '@heroui/react';
       import { Form } from './barrel';
       export const Page = () => <Card><Card.Content><Form /></Card.Content></Card>;`,
    );

    const violations = findViolations(path.join(dir, 'page.tsx'));
    fs.rmSync(dir, { recursive: true, force: true });

    expect(violations).toHaveLength(1);
    expect(violations[0].detail).toContain('<Form>');
  });

  it('follows helpers and JSX variables used in non-identifier expression slots', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'att834-'));
    fs.writeFileSync(
      path.join(dir, 'page.tsx'),
      `import { Card, TextField } from '@heroui/react';
       const Form = () => <TextField />;
       export const Page = ({ show }) => {
         const body = <TextField />;
         const renderBody = () => <Form />;
         return <Card><Card.Content>
           {renderBody()}
           {show ? body : <Form />}
         </Card.Content></Card>;
       };`,
    );

    const violations = findViolations(path.join(dir, 'page.tsx'));
    fs.rmSync(dir, { recursive: true, force: true });

    expect(violations).toHaveLength(3);
    expect(violations.map((violation) => violation.detail).join()).toContain('<TextField>');
    expect(violations.map((violation) => violation.detail).join()).toContain('<Form>');
  });

  it('does not resolve a JSX variable belonging to a different component in the same file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'att834-'));
    fs.writeFileSync(
      path.join(dir, 'page.tsx'),
      `import { Card, TextField } from '@heroui/react';
       export const InnocentPanel = () => {
         const body = <div>just text</div>;
         return <Card><Card.Content>{body}</Card.Content></Card>;
       };
       export const RealForm = () => {
         const body = <TextField />;
         return <div>{body}</div>;
       };`,
    );

    const violations = findViolations(path.join(dir, 'page.tsx'));
    fs.rmSync(dir, { recursive: true, force: true });

    expect(violations).toEqual([]);
  });

  it('treats a component that wraps its children in a Card as a Card surface', () => {
    // The shape of maintenance-hub/section-card.tsx, which has 7 call sites.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'att834-'));
    fs.writeFileSync(
      path.join(dir, 'SectionCard.tsx'),
      `import { Card } from '@heroui/react';
       export function SectionCard({ children }) {
         return <Card><Card.Content>{children}</Card.Content></Card>;
       }`,
    );
    fs.writeFileSync(
      path.join(dir, 'page.tsx'),
      `import { TextField } from '@heroui/react';
       import { SectionCard } from './SectionCard';
       export const Page = () => <SectionCard><TextField /></SectionCard>;`,
    );

    const violations = findViolations(path.join(dir, 'page.tsx'));
    fs.rmSync(dir, { recursive: true, force: true });

    expect(violations).toHaveLength(1);
    expect(violations[0].detail).toContain('<TextField>');
  });

  it('follows a wrapper of a wrapper to the Card underneath', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'att834-'));
    fs.writeFileSync(
      path.join(dir, 'SectionCard.tsx'),
      `import { Card } from '@heroui/react';
       export function SectionCard({ children }) {
         return <Card><Card.Content>{children}</Card.Content></Card>;
       }`,
    );
    fs.writeFileSync(
      path.join(dir, 'PanelCard.tsx'),
      `import { SectionCard } from './SectionCard';
       export function PanelCard({ children }) { return <SectionCard>{children}</SectionCard>; }`,
    );
    fs.writeFileSync(
      path.join(dir, 'page.tsx'),
      `import { TextField } from '@heroui/react';
       import { PanelCard } from './PanelCard';
       export const Page = () => <PanelCard><TextField /></PanelCard>;`,
    );

    const violations = findViolations(path.join(dir, 'page.tsx'));
    fs.rmSync(dir, { recursive: true, force: true });

    expect(violations).toHaveLength(1);
    expect(violations[0].detail).toContain('<TextField>');
  });

  it('does not cache a false wrapper result computed under a truncated cycle', () => {
    // A is a Card surface directly; B only via A. A reaches <B> before its own <Card>, so
    // evaluating A first would cache B=false before A ever resolves to true — making the
    // answer depend on scan order.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'att834-'));
    fs.writeFileSync(
      path.join(dir, 'A.tsx'),
      `import { Card } from '@heroui/react';
       import { B } from './B';
       export function A({ children }) {
         return <div><B>{children}</B><Card><Card.Content>{children}</Card.Content></Card></div>;
       }`,
    );
    fs.writeFileSync(
      path.join(dir, 'B.tsx'),
      `import { A } from './A';
       export function B({ children }) { return <A>{children}</A>; }`,
    );
    fs.writeFileSync(
      path.join(dir, 'page.tsx'),
      `import { TextField } from '@heroui/react';
       import { B } from './B';
       export const Page = () => <B><TextField /></B>;`,
    );

    // Warm A first — this is the scan order that poisons B.
    wrapsChildrenInCard(path.join(dir, 'A.tsx'), 'A');
    const violations = findViolations(path.join(dir, 'page.tsx'));
    fs.rmSync(dir, { recursive: true, force: true });

    expect(violations).toHaveLength(1);
    expect(violations[0].detail).toContain('<TextField>');
  });

  it('does not treat a component that renders a Card beside its children as a Card surface', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'att834-'));
    fs.writeFileSync(
      path.join(dir, 'Sidebar.tsx'),
      `import { Card } from '@heroui/react';
       export function Sidebar({ children }) {
         return <div><Card><Card.Content>fixed blurb</Card.Content></Card><div>{children}</div></div>;
       }`,
    );
    fs.writeFileSync(
      path.join(dir, 'page.tsx'),
      `import { TextField } from '@heroui/react';
       import { Sidebar } from './Sidebar';
       export const Page = () => <Sidebar><TextField /></Sidebar>;`,
    );

    const violations = findViolations(path.join(dir, 'page.tsx'));
    fs.rmSync(dir, { recursive: true, force: true });

    expect(violations).toEqual([]);
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
