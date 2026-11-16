const MARKER = /^[ \t*]*optional:[ \t]*[^\s*]/im;

/** Require a `// optional: <reason>` comment next to every `@Optional()` injection. */
module.exports = {
  meta: {
    type: 'problem',
    docs: { description: 'Require a justification comment (`optional: <reason>`) on every @Optional() injection' },
    schema: [],
    messages: {
      missingJustification:
        'Make this dependency required; security and audit collaborators must not be @Optional(). If it really is optional, put `// optional: <reason>` directly above its decorators or at the end of the decorator line.',
    },
  },
  create(context) {
    const source = context.sourceCode;
    // Local names bound to `Optional` from @nestjs/common, e.g. `import { Optional as Opt }`.
    const optionalNames = new Set(['Optional']);

    const isOptionalCall = (expression) => {
      if (expression.type !== 'CallExpression') return false;
      const { callee } = expression;
      if (callee.type === 'Identifier') return optionalNames.has(callee.name);
      return callee.type === 'MemberExpression' && !callee.computed && callee.property.name === 'Optional';
    };

    // A run of comments, each alone on its line, ending on the line directly above `node`.
    const justifiedAbove = (node) => {
      const comments = source.getCommentsBefore(node);
      const previousToken = source.getTokenBefore(node);
      let expectedLine = node.loc.start.line - 1;
      for (let i = comments.length - 1; i >= 0; i--) {
        const comment = comments[i];
        if (comment.loc.end.line !== expectedLine) return false;
        if (previousToken && previousToken.loc.end.line === comment.loc.start.line) return false;
        if (MARKER.test(comment.value)) return true;
        expectedLine = comment.loc.start.line - 1;
      }
      return false;
    };

    const justifiedOnLine = (node) =>
      source
        .getAllComments()
        .some((comment) => comment.loc.start.line === node.loc.start.line && MARKER.test(comment.value));

    return {
      ImportDeclaration(node) {
        if (node.source.value !== '@nestjs/common') return;
        for (const specifier of node.specifiers) {
          if (specifier.type === 'ImportSpecifier' && specifier.imported.name === 'Optional') {
            optionalNames.add(specifier.local.name);
          }
        }
      },
      Decorator(node) {
        if (!isOptionalCall(node.expression)) return;

        const decorators = node.parent.decorators?.length ? node.parent.decorators : [node];
        const justified = justifiedAbove(decorators[0]) || justifiedAbove(node) || justifiedOnLine(node);
        if (!justified) context.report({ node, messageId: 'missingJustification' });
      },
    };
  },
};
