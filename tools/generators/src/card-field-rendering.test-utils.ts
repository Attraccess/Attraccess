import { declarationOf } from './card-field-declarations.test-utils';
import { resolveComponent } from './card-field-exports.test-utils';
import {
  callArgumentIdentifiers,
  FIELD_PRIMITIVES,
  localImports,
  Node,
  parse,
  tagOf,
  ts,
  walkJsx,
  walkJsxExpressionIdentifiers,
} from './card-field-source.test-utils';

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
