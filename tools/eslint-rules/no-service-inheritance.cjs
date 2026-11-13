const MARKER = /^[ \t*]*inheritance:[ \t]*[^\s*]/im;

/** Nest decorators whose classes must compose collaborators instead of inheriting from them. */
const DI_DECORATORS = new Set(['Injectable', 'Controller']);

/**
 * Framework base classes a provider may extend. Call expressions such as `PassportStrategy(...)` and
 * `AuthGuard(...)` are always allowed: they are framework mixins, not service layers.
 * - SAML: @node-saml's protocol client, which the SAML logout adapter specialises.
 * - EventEmitter: Node's event base for connection objects that emit events.
 * - Duplex: Node's stream base for adapting a WebSocket to a byte stream.
 * - ConsoleLogger: Nest's logger base, specialised for log formatting and routing.
 * - BaseExceptionFilter: Nest's exception filter base, extended by `@Catch()` filters.
 * - Set: the built-in collection, specialised by serialisable permission sets.
 */
const ALLOWED_BASES = new Set(['SAML', 'EventEmitter', 'Duplex', 'ConsoleLogger', 'BaseExceptionFilter', 'Set']);

/** `Error` and every `*Error` / `*Exception` base: error hierarchies are data, not service layers. */
const ERROR_BASE = /^(Error|.*(Error|Exception))$/;

/** DTO files and folders (`dto/`, `dtos/`, `*.dto.ts`): undecorated data classes there may extend. */
const DTO_FILE = /(^|\/)dtos?\/|\.dto\.ts$/;

/**
 * ATT-1213 / ATT-1235: services, controllers and plain classes compose their collaborators. Reports every abstract
 * class and every class that extends another class, unless `// inheritance: <reason>` sits directly above it.
 * Always allowed: mixin calls such as `PassportStrategy(...)`, error bases, `ALLOWED_BASES`, and undecorated classes
 * in DTO files.
 */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow abstract classes and class inheritance (except errors, mixins, DTOs and framework bases); compose collaborators instead',
    },
    schema: [],
    messages: {
      abstractClass:
        'Compose an injectable collaborator instead of an abstract base class. If this class is a genuine DI token or framework contract, put `// inheritance: <reason>` directly above it.',
      providerInheritance:
        '@{{decorator}}() classes must not extend {{base}}; inject the collaborator instead. Framework bases need `// inheritance: <reason>` directly above the class.',
      classInheritance:
        'Classes must not extend {{base}}; compose the collaborator instead. Errors, DTOs and framework bases are allowed; other genuine cases need `// inheritance: <reason>` directly above the class.',
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

    const isErrorBase = (superClass) => superClass.type === 'Identifier' && ERROR_BASE.test(superClass.name);
    const isDtoFile = () => DTO_FILE.test(context.filename.replace(/\\/g, '/'));

    const check = (node) => {
      if (node.abstract) {
        if (!justified(node)) context.report({ node: node.id ?? node, messageId: 'abstractClass' });
        return;
      }
      if (!node.superClass) return;
      const decorator = (node.decorators ?? []).map(decoratorName).find((name) => DI_DECORATORS.has(name));
      if (node.superClass.type === 'CallExpression') return;
      if (isErrorBase(node.superClass)) return;
      if (node.superClass.type === 'Identifier' && ALLOWED_BASES.has(node.superClass.name)) return;
      if (!decorator && isDtoFile()) return;
      if (justified(node)) return;
      context.report({
        node: node.superClass,
        messageId: decorator ? 'providerInheritance' : 'classInheritance',
        data: { decorator, base: source.getText(node.superClass) },
      });
    };

    return { ClassDeclaration: check, ClassExpression: check };
  },
};
