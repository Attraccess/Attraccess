/** Forbid deriving types from a hook's return value; props and helpers use explicit types instead. */
const isHookName = (name) => /^use[A-Z0-9]/.test(name);

/** The hook named by `typeof useX`, `typeof ns.useX` or `typeof import('./x').useX`, or ''. */
function hookNameOfTypeQuery(query) {
  const name = query.exprName;
  if (name.type === 'Identifier') return name.name;
  if (name.type === 'TSQualifiedName') return name.right.name;
  if (name.type === 'TSImportType' && name.qualifier) {
    return name.qualifier.type === 'Identifier' ? name.qualifier.name : (name.qualifier.right?.name ?? '');
  }
  return '';
}

module.exports = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow ReturnType<typeof useX> in frontend source' },
    schema: [],
    messages: {
      hookReturnType:
        'Do not derive types from a hook with ReturnType<typeof {{name}}>. Use an explicit type (a DTO from @attraccess/react-query-client, UseQueryResult<T>, QueryClient, …) or a small props interface.',
    },
  },
  create(context) {
    // `type H = typeof useX` aliases, and `ReturnType<H>` uses that may refer to one (either order in the file).
    const hookTypeAliases = new Map();
    const aliasUses = [];
    return {
      TSTypeAliasDeclaration(node) {
        if (node.typeAnnotation.type !== 'TSTypeQuery') return;
        const hookName = hookNameOfTypeQuery(node.typeAnnotation);
        if (isHookName(hookName)) hookTypeAliases.set(node.id.name, hookName);
      },
      TSTypeReference(node) {
        if (node.typeName.type !== 'Identifier' || node.typeName.name !== 'ReturnType') return;
        const params = node.typeArguments ?? node.typeParameters;
        const arg = params?.params?.[0];
        if (arg?.type === 'TSTypeReference' && arg.typeName.type === 'Identifier') {
          aliasUses.push({ node, alias: arg.typeName.name });
          return;
        }
        if (arg?.type !== 'TSTypeQuery') return;
        const hookName = hookNameOfTypeQuery(arg);
        if (!isHookName(hookName)) return;
        context.report({ node, messageId: 'hookReturnType', data: { name: hookName } });
      },
      'Program:exit'() {
        for (const { node, alias } of aliasUses) {
          const hookName = hookTypeAliases.get(alias);
          if (hookName) context.report({ node, messageId: 'hookReturnType', data: { name: hookName } });
        }
      },
    };
  },
};
