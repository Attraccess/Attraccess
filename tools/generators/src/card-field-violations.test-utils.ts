import * as path from 'path';
import { lookupVariable } from './card-field-declarations.test-utils';
import { resolveComponent } from './card-field-exports.test-utils';
import { rendersField } from './card-field-rendering.test-utils';
import {
  FIELD_PRIMITIVES,
  isJsx,
  isPortal,
  localImports,
  Node,
  parse,
  ROOT,
  tagOf,
  ts,
  walkJsx,
} from './card-field-source.test-utils';
import { wrapsChildrenInCard } from './card-field-wrappers.test-utils';

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
