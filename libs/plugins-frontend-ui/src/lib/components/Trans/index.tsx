import React, { useMemo } from 'react';
import { TFunction } from '../../i18n';

interface TransProps {
  // Included for API parity; not used by current t() implementation
  count?: number;
  i18nKey: string;
  values?: Record<string, unknown>;
  components?: Record<string, React.ReactNode>;
  t: TFunction;
}

type ParsedNode =
  | { type: 'text'; text: string }
  | { type: 'tag'; name: string; children: ParsedNode[]; selfClosing: boolean };

function parseTemplateToTree(template: string): ParsedNode[] {
  const root: { children: ParsedNode[] } = { children: [] };
  const stack: Array<{ name: string; children: ParsedNode[] }> = [];
  const tagRegex = /<\/?([a-zA-Z0-9_]+)\s*\/?\s*>/g;
  let lastIndex = 0;

  const getCurrentChildren = () => (stack.length === 0 ? root.children : stack[stack.length - 1].children);

  let match: RegExpExecArray | null;
  while ((match = tagRegex.exec(template)) !== null) {
    const fullMatch = match[0];
    const tagName = match[1];
    const isClosing = fullMatch.startsWith('</');
    const isSelfClosing = /\/>\s*$/.test(fullMatch) || (!isClosing && fullMatch.endsWith('/>'));

    if (match.index > lastIndex) {
      const text = template.slice(lastIndex, match.index);
      if (text) {
        getCurrentChildren().push({ type: 'text', text });
      }
    }

    if (isSelfClosing && !isClosing) {
      getCurrentChildren().push({ type: 'tag', name: tagName, children: [], selfClosing: true });
    } else if (isClosing) {
      // Pop until matching tag is found
      let foundIndex = -1;
      for (let i = stack.length - 1; i >= 0; i -= 1) {
        if (stack[i].name === tagName) {
          foundIndex = i;
          break;
        }
      }
      if (foundIndex === -1) {
        // Treat unmatched closing as text
        getCurrentChildren().push({ type: 'text', text: fullMatch });
      } else {
        // Close all open tags until foundIndex
        for (let i = stack.length - 1; i >= foundIndex; i -= 1) {
          const open = stack.pop() as { name: string; children: ParsedNode[] };
          const node: ParsedNode = { type: 'tag', name: open.name, children: open.children, selfClosing: false };
          if (i === foundIndex) {
            getCurrentChildren().push(node);
          } else {
            // This should not generally happen with well-formed templates; nest improperly closed tags
            const parentChildren = stack.length === 0 ? root.children : stack[stack.length - 1].children;
            parentChildren.push(node);
          }
        }
      }
    } else {
      // opening tag
      stack.push({ name: tagName, children: [] });
    }

    lastIndex = tagRegex.lastIndex;
  }

  if (lastIndex < template.length) {
    const text = template.slice(lastIndex);
    if (text) {
      getCurrentChildren().push({ type: 'text', text });
    }
  }

  // Close any remaining open tags by treating them as text (to avoid swallowing content)
  while (stack.length > 0) {
    const dangling = stack.pop() as { name: string; children: ParsedNode[] };
    root.children.push({
      type: 'text',
      text: `<${dangling.name}>${dangling.children.map((c) => (c as { text: string }).text || '').join('')}`,
    });
  }

  return root.children;
}

function renderParsedNodes(
  nodes: ParsedNode[],
  components?: Record<string, React.ReactNode>,
  keyPrefix = 'k',
): React.ReactNode[] {
  const rendered: React.ReactNode[] = [];
  nodes.forEach((node, index) => {
    const key = `${keyPrefix}-${index}`;
    if (node.type === 'text') {
      rendered.push(node.text);
      return;
    }

    const provided = components?.[node.name];
    if (React.isValidElement(provided)) {
      if (node.selfClosing) {
        rendered.push(React.cloneElement(provided, { key }));
      } else {
        const children = renderParsedNodes(node.children, components, key);
        rendered.push(React.cloneElement(provided, { key }, children));
      }
      return;
    }

    // If no component provided for this tag, just render its children (drop the tag wrapper)
    if (node.selfClosing) {
      // nothing to render for a self-closing tag without mapping
      return;
    }
    rendered.push(...renderParsedNodes(node.children, components, key));
  });
  return rendered;
}

export function Trans(props: TransProps) {
  const { i18nKey, values, components, t } = props;

  const translation = useMemo(() => t(i18nKey, values), [t, i18nKey, values]);
  const tree = useMemo(() => parseTemplateToTree(translation), [translation]);
  return useMemo(() => renderParsedNodes(tree, components), [tree, components]);
}
