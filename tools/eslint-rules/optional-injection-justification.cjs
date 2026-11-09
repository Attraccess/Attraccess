/** Require a `// optional: <reason>` comment next to every `@Optional()` injection. */
const MARKER = /\boptional:\s*\S/i;

module.exports = {
  meta: {
    type: 'problem',
    docs: { description: 'Require a justification comment (`optional: <reason>`) on every @Optional() injection' },
    schema: [],
    messages: {
      missingJustification:
        '@Optional() needs a justification comment directly above or on the same line, e.g. `// optional: <reason>`.',
    },
  },
  create(context) {
    const source = context.sourceCode;
    const comments = source.getAllComments();

    return {
      Decorator(node) {
        const { expression } = node;
        if (expression.type !== 'CallExpression' || expression.callee.name !== 'Optional') return;

        const line = node.loc.start.line;
        const justified = comments.some((comment) => {
          const attached =
            comment.loc.end.line === line - 1 || comment.loc.start.line === line || comment.loc.end.line === line;
          return attached && MARKER.test(comment.value);
        });
        if (!justified) context.report({ node, messageId: 'missingJustification' });
      },
    };
  },
};
