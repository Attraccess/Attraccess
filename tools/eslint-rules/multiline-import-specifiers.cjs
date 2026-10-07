/** Keep each named entry on its own line when an import block spans multiple lines. */
module.exports = {
  meta: {
    type: 'layout',
    docs: { description: 'Require one named import specifier per line in multiline import blocks' },
    fixable: 'whitespace',
    schema: [],
    messages: { onePerLine: 'Put each named import on its own line in a multiline import block.' },
  },
  create(context) {
    const source = context.sourceCode;
    return {
      ImportDeclaration(node) {
        const named = node.specifiers.filter((specifier) => specifier.type === 'ImportSpecifier');
        if (named.length < 2) return;

        const open = source.getTokenBefore(named[0]);
        const close = source.getTokenAfter(named[named.length - 1], { filter: (token) => token.value === '}' });
        if (open.loc.start.line === close.loc.end.line) return;

        const ownLine = named.find((specifier) =>
          /^\s*$/.test(source.lines[specifier.loc.start.line - 1].slice(0, specifier.loc.start.column)),
        );
        const indent = ownLine
          ? source.lines[ownLine.loc.start.line - 1].slice(0, ownLine.loc.start.column)
          : `${source.lines[open.loc.start.line - 1].match(/^\s*/)[0]}  `;
        const newline = source.text.includes('\r\n') ? '\r\n' : '\n';

        for (let index = 1; index < named.length; index++) {
          const current = named[index];
          if (named[index - 1].loc.end.line !== current.loc.start.line) continue;

          context.report({
            node: current,
            messageId: 'onePerLine',
            fix(fixer) {
              // Keep aliases, type modifiers, commas and comments untouched.
              const previousToken = source.getTokenBefore(current, { includeComments: true });
              return fixer.replaceTextRange([previousToken.range[1], current.range[0]], `${newline}${indent}`);
            },
          });
        }
      },
    };
  },
};
