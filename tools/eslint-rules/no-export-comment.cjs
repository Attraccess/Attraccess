/** Forbid a comment between `export` and the declaration it exports (`export // note`). */
module.exports = {
  meta: {
    type: 'layout',
    docs: { description: 'Disallow comments directly after the export keyword' },
    schema: [],
    messages: { exportComment: 'Put the comment above the export declaration instead of after the `export` keyword.' },
  },
  create(context) {
    const source = context.sourceCode;
    const check = (node) => {
      let exportToken = source.getFirstToken(node);
      if (node.type === 'ExportDefaultDeclaration') exportToken = source.getTokenAfter(exportToken);
      const next = source.getTokenAfter(exportToken, { includeComments: true });
      if (next && (next.type === 'Line' || next.type === 'Block')) {
        context.report({ loc: next.loc, messageId: 'exportComment' });
      }
    };
    return {
      ExportNamedDeclaration: check,
      ExportDefaultDeclaration: check,
      ExportAllDeclaration: check,
      TSExportAssignment: check,
    };
  },
};
