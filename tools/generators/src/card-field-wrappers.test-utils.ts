import { declarationOf } from './card-field-declarations.test-utils';
import { resolveComponent } from './card-field-exports.test-utils';
import { callArgumentIdentifiers, isJsx, localImports, Node, parse, tagOf, ts } from './card-field-source.test-utils';

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
