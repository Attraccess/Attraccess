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
    const reportCommentAfter = (token) => {
      const next = source.getTokenAfter(token, { includeComments: true });
      if (next && (next.type === 'Line' || next.type === 'Block')) {
        context.report({ loc: next.loc, messageId: 'exportComment' });
        return true;
      }
      return false;
    };
    // `export /* c */ …`, and also `export default /* c */ …` / `export type /* c */ { … }`.
    const check = (node) => {
      const exportToken = source.getFirstToken(node);
      if (reportCommentAfter(exportToken)) return;
      const keyword = source.getTokenAfter(exportToken);
      if (keyword && (keyword.value === 'default' || keyword.value === 'type')) reportCommentAfter(keyword);
    };
    return {
      ExportNamedDeclaration: check,
      ExportDefaultDeclaration: check,
      ExportAllDeclaration: check,
      TSExportAssignment: check,
    };
  },
};
