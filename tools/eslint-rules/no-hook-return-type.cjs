/** Forbid deriving types from a hook's return value; props and helpers use explicit types instead. */
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
    return {
      TSTypeReference(node) {
        if (node.typeName.type !== 'Identifier' || node.typeName.name !== 'ReturnType') return;
        const params = node.typeArguments ?? node.typeParameters;
        const arg = params?.params?.[0];
        if (arg?.type !== 'TSTypeQuery') return;
        const name = arg.exprName;
        const hookName = name.type === 'Identifier' ? name.name : name.type === 'TSQualifiedName' ? name.right.name : '';
        if (!/^use[A-Z0-9]/.test(hookName)) return;
        context.report({ node, messageId: 'hookReturnType', data: { name: hookName } });
      },
    };
  },
};
