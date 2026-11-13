const path = require('node:path');

const MARKER = /^[ \t*]*inheritance:[ \t]*[^\s*]/im;

/** Nest decorators whose classes must compose collaborators instead of inheriting from them. */
const DI_DECORATORS = new Set(['Injectable', 'Controller']);

/**
 * Framework base classes any class may extend, imported directly (`Duplex`) or through a namespace (`stream.Duplex`).
 * Call expressions such as `PassportStrategy(...)` and `AuthGuard(...)` are always allowed: they are framework mixins,
 * not service layers.
 * - SAML: @node-saml's protocol client, which the SAML logout adapter specialises.
 * - EventEmitter: Node's event base for connection objects that emit events.
 * - Duplex: Node's stream base for adapting a WebSocket to a byte stream.
 * - ConsoleLogger: Nest's logger base, specialised for log formatting and routing.
 * - BaseExceptionFilter: Nest's exception filter base, extended by `@Catch()` filters.
 * - Set: the built-in collection, specialised by serialisable permission sets.
 */
const ALLOWED_BASES = new Set(['SAML', 'EventEmitter', 'Duplex', 'ConsoleLogger', 'BaseExceptionFilter', 'Set']);

/** `Error` and every `*Error` / `*Exception` base: error hierarchies are data, not service layers. */
const ERROR_BASE = /(Error|Exception)$/;

/**
 * DTO files and folders (`dto/`, `dtos/`, `*.dto.ts`), matched on the path relative to the lint cwd: classes there
 * without `@Injectable()` / `@Controller()` may extend.
 */
const DTO_FILE = /(^|\/)dtos?\/|\.dto\.ts$/;

/**
 * ATT-1213 / ATT-1235: services, controllers and plain classes compose their collaborators. Reports every abstract
 * class and every class that extends another class, unless `// inheritance: <reason>` sits directly above it.
 * Always allowed: mixin calls such as `PassportStrategy(...)`, error bases, `ALLOWED_BASES`, and classes without
 * `@Injectable()` / `@Controller()` in DTO files.
 */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow abstract classes and class inheritance (except error bases, mixin calls, allow-listed framework bases and DTO files); compose collaborators instead',
    },
    schema: [],
    messages: {
      abstractClass:
        'Compose an injectable collaborator instead of an abstract base class. If this class is a genuine DI token or framework contract, put `// inheritance: <reason>` directly above it.',
      providerInheritance:
        '@{{decorator}}() classes must not extend {{base}}; inject the collaborator instead. Other framework bases need `// inheritance: <reason>` directly above the class.',
      classInheritance:
        'Classes must not extend {{base}}; compose instead of inheriting. Exempt without a marker: `Error` / `*Error` / `*Exception` bases, mixin calls such as `PartialType(...)`, allow-listed framework bases, and classes without `@Injectable()` / `@Controller()` in `dto/`, `dtos/` or `*.dto.ts` files. Other genuine cases need `// inheritance: <reason>` directly above the class.',
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

    // The statement holding a class expression: `const A = class …`, `export const A = class …`, `return class …`.
    const holdingStatement = (node) => {
      if (node.parent?.type === 'ReturnStatement') return node.parent;
      if (node.parent?.type !== 'VariableDeclarator' || node.parent.init !== node) return undefined;
      const declaration = node.parent.parent;
      return declaration.parent?.type === 'ExportNamedDeclaration' ? declaration.parent : declaration;
    };

    // A run of comments, each alone on its line, ending on the line directly above `start`.
    const markedAbove = (start) => {
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

    // Marked directly above the class or, for a class expression, above the statement that holds it.
    const justified = (node) => {
      if (markedAbove(outermost(node))) return true;
      const statement = holdingStatement(node);
      return statement !== undefined && markedAbove(statement);
    };

    const decoratorName = (decorator) => {
      const expression = decorator.expression;
      if (expression.type !== 'CallExpression') return undefined;
      const { callee } = expression;
      if (callee.type === 'Identifier') return callee.name;
      if (callee.type === 'MemberExpression' && !callee.computed) return callee.property.name;
      return undefined;
    };

    // `Base` or `ns.Base`: the exemptions match the class name, whichever way it was imported.
    const baseName = (superClass) => {
      if (superClass.type === 'Identifier') return superClass.name;
      if (superClass.type === 'MemberExpression' && !superClass.computed) return superClass.property.name;
      return undefined;
    };
    const isExemptBase = (superClass) => {
      const name = baseName(superClass);
      return name !== undefined && (ERROR_BASE.test(name) || ALLOWED_BASES.has(name));
    };
    const inDtoFile = DTO_FILE.test(path.relative(context.cwd, context.filename).replace(/\\/g, '/'));

    const check = (node) => {
      if (node.abstract) {
        if (!justified(node)) context.report({ node: node.id ?? node, messageId: 'abstractClass' });
        return;
      }
      if (!node.superClass) return;
      if (node.superClass.type === 'CallExpression') return;
      if (isExemptBase(node.superClass)) return;
      const decorator = (node.decorators ?? []).map(decoratorName).find((name) => DI_DECORATORS.has(name));
      if (!decorator && inDtoFile) return;
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
