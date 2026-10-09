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

/** `export function Name` / `export class Name` / `export const Name` carry this modifier. */
export function hasExportModifier(node: Node): boolean {
  const modifiers = node.modifiers as Node[] | undefined;
  return !!modifiers && modifiers.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
}

/** The top-level declaration of `name` in `source`, exported or not. */
export function findLocalDeclaration(source: Node, name: string): Node | null {
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
export function declarationOf(source: Node, name: string): Node | null {
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
export function definesLocally(source: Node, name: string): boolean {
  for (const statement of source.statements as Node[]) {
    if (
      name === 'default' &&
      ((ts.isExportAssignment(statement) && !statement.isExportEquals) ||
        ((ts.isFunctionDeclaration(statement) || ts.isClassDeclaration(statement)) &&
          (statement.modifiers as Node[] | undefined)?.some(
            (modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword,
          )))
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
 * The initializer bound to `name` as seen from `node`, resolved outwards through enclosing
 * scopes — `const body = <div />` in the component holding the Card, not the `const body` in
 * a sibling component further down the file.
 *
 * A file-wide map keyed by bare name (which this was) lets one component's variable answer for
 * another's, reporting a field at a line no Card ever contained. Same failure the `<file>#<name>`
 * cache key exists to prevent, arriving by the variable path instead of the export path.
 */
export function lookupVariable(node: Node, name: string): Node | null {
  for (let scope = node.parent as Node | undefined; scope; scope = scope.parent as Node | undefined) {
    // Blocks and the source file are the only `const` scopes that matter here.
    const statements = scope.statements as Node[] | undefined;
    if (!statements) continue;
    for (const statement of statements) {
      if (ts.isFunctionDeclaration(statement) && statement.name && (statement.name as Node).text === name)
        return statement;
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

/** A component export, pinned to the module that declares it. */
export interface Export {
  file: string;
  name: string;
}

/**
 * The set of module files that provide the export `name` from `file`, following re-export
 * barrels (`export * from` / `export { x } from`). Resolution is name-aware: a barrel that
 * re-exports both fields and non-fields (e.g. `@attraccess/plugins-frontend-ui`) must resolve
 * the specific name, or every consumer of that barrel would read as a field.
 */
export function resolveExport(file: string, name: string, seen = new Set<string>()): Export[] {
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

  // `import X from './x'; export default X;` is the default-export counterpart
  // to the locally imported named re-export handled below.
  if (name === 'default') {
    for (const statement of source.statements as Node[]) {
      if (!ts.isExportAssignment(statement) || statement.isExportEquals || !ts.isIdentifier(statement.expression))
        continue;
      const imported = imports.get((statement.expression as Node).text as string);
      if (imported) results.push(...resolveExport(imported.file, imported.name, seen));
    }
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
export function resolveComponent(file: string, source: Node, imports: Map<string, Import>, name: string): Export[] {
  const imported = imports.get(name);
  if (imported) return resolveExport(imported.file, imported.name);
  return findLocalDeclaration(source, name) ? [{ file, name }] : [];
}

/** Keyed `<file>#<export name>`, not by file — see `rendersField`. */
export const rendersFieldCache = new Map<string, boolean>();

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
export function rendersField(
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
  const initializer =
    (declaration.initializer as Node | undefined) ?? (ts.isCallExpression(declaration) ? declaration : undefined);
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

export interface Violation {
  location: string;
  detail: string;
}

export function findViolations(file: string): Violation[] {
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
    // or select one branch. Follow only expressions that can provide the rendered value.
    const expandExpressions = (current: Node): void => {
      current.forEachChild((child) => {
        if (isJsx(child) && isPortal(tagOf(child))) return;
        if (ts.isJsxExpression(child) && child.expression) {
          const followRenderedExpression = (expression: Node): void => {
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
            } else if (ts.isCallExpression(expression)) {
              followRenderedExpression(expression.expression as Node);
            } else if (ts.isConditionalExpression(expression)) {
              followRenderedExpression(expression.whenTrue as Node);
              followRenderedExpression(expression.whenFalse as Node);
            } else if (ts.isBinaryExpression(expression)) {
              const operator = (expression.operatorToken as Node).kind;
              if (operator === ts.SyntaxKind.AmpersandAmpersandToken) {
                followRenderedExpression(expression.right as Node);
              } else if (operator === ts.SyntaxKind.BarBarToken || operator === ts.SyntaxKind.QuestionQuestionToken) {
                followRenderedExpression(expression.left as Node);
                followRenderedExpression(expression.right as Node);
              }
            } else if (ts.isParenthesizedExpression(expression)) {
              followRenderedExpression(expression.expression as Node);
            }
          };
          followRenderedExpression(child.expression as Node);
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

export const wrapsChildrenCache = new Map<string, boolean>();

/** Is there a `{children}` / `{props.children}` slot anywhere below `node`? */
export function containsChildrenSlot(node: Node): boolean {
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
export function wrapsChildrenInCard(
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
  const initializer =
    (declaration.initializer as Node | undefined) ?? (ts.isCallExpression(declaration) ? declaration : undefined);
  if (initializer && ts.isCallExpression(initializer)) {
    for (const identifier of callArgumentIdentifiers(initializer)) {
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
