const MARKER = /^[ \t*]*inheritance:[ \t]*[^\s*]/im;

/** Nest decorators whose classes must compose collaborators instead of inheriting from them. */
const DI_DECORATORS = new Set(['Injectable', 'Controller']);

/**
 * Framework base classes a provider may extend. Call expressions such as `PassportStrategy(...)` and
 * `AuthGuard(...)` are always allowed: they are framework mixins, not service layers.
 * - SAML: @node-saml's protocol client, which the SAML logout adapter specialises.
 */
const ALLOWED_BASES = new Set(['SAML']);

/**
 * ATT-1213: services and controllers compose their collaborators. Reports every abstract class and every
 * @Injectable()/@Controller() class that extends another class, unless `// inheritance: <reason>` sits directly
 * above it.
 */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow abstract classes and inheritance in Nest providers and controllers; compose collaborators instead',
    },
    schema: [],
    messages: {
      abstractClass:
        'Compose an injectable collaborator instead of an abstract base class. If this class is a genuine DI token or framework contract, put `// inheritance: <reason>` directly above it.',
      providerInheritance:
        '@{{decorator}}() classes must not extend {{base}}; inject the collaborator instead. Framework bases need `// inheritance: <reason>` directly above the class.',
    },
  },
  create(context) {
    const source = context.sourceCode;

    // The class, with its decorators and an `export` in front of it.
    const outermost = (node) => {
      const candidates = [node, ...(node.decorators ?? [])];
      if (node.parent?.type === 'ExportNamedDeclaration' || node.parent?.type === 'ExportDefaultDeclaration')
        candidates.push(node.parent);
      return candidates.reduce((first, candidate) => (candidate.range[0] < first.range[0] ? candidate : first));
    };

    // A run of comments, each alone on its line, ending on the line directly above the class.
    const justified = (node) => {
      const start = outermost(node);
      const comments = source.getCommentsBefore(start);
      const previousToken = source.getTokenBefore(start, { includeComments: false });
      let expectedLine = start.loc.start.line - 1;
      for (let i = comments.length - 1; i >= 0; i--) {
        const comment = comments[i];
        if (comment.loc.end.line !== expectedLine) return false;
        if (previousToken && previousToken.loc.end.line === comment.loc.start.line) return false;
        if (MARKER.test(comment.value)) return true;
        expectedLine = comment.loc.start.line - 1;
      }
      return false;
    };

    const decoratorName = (decorator) => {
      const expression = decorator.expression;
      if (expression.type !== 'CallExpression') return undefined;
      const { callee } = expression;
      if (callee.type === 'Identifier') return callee.name;
      if (callee.type === 'MemberExpression' && !callee.computed) return callee.property.name;
      return undefined;
    };

    const check = (node) => {
      if (node.abstract) {
        if (!justified(node)) context.report({ node: node.id ?? node, messageId: 'abstractClass' });
        return;
      }
      if (!node.superClass) return;
      const decorator = (node.decorators ?? []).map(decoratorName).find((name) => DI_DECORATORS.has(name));
      if (!decorator) return;
      if (node.superClass.type === 'CallExpression') return;
      if (node.superClass.type === 'Identifier' && ALLOWED_BASES.has(node.superClass.name)) return;
      if (justified(node)) return;
      context.report({
        node: node.superClass,
        messageId: 'providerInheritance',
        data: { decorator, base: source.getText(node.superClass) },
      });
    };

    return { ClassDeclaration: check, ClassExpression: check };
  },
};
