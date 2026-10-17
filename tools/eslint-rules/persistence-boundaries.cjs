const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const ENGINES =
  /^(?:typeorm|@nestjs\/typeorm|node:sqlite|sqlite3|better-sqlite3|sql\.js|pg|postgres|mysql2|mariadb|mssql|oracledb|knex|sequelize|drizzle-orm|@prisma\/client)(?:\/|$)/;
const LEGACY = /^@attraccess\/(?:database-entities(?:\/|$)|plugins-backend-sdk(?:$|\/adapter(?:\/|$)))/;
const normalized = (value) => value.replaceAll('\\', '/');
const configurations = new Map();
const sources = new Map();

/** Composition and released compatibility surfaces are explicit; a directory named persistence is insufficient. */
function implementation(file) {
  const name = normalized(file);
  return (
    /(?:^|\/)(?:__test__|test-utils|acceptance|migrations|migration-helpers)\//.test(name) ||
    /(?:\.|\/)(?:spec|test|integration|test-fixture|test-utils)\.[cm]?[jt]sx?$/.test(name) ||
    /(?:^|\/)fixtures\//.test(name) ||
    /\/apps\/api\/src\/(?:main\.bootstrap|database\/tooling|plugin-system\/runtime\/module-loader)\.ts$/.test(name) ||
    /\/auth\/session-store\/persistence\/user-reader\.ts$/.test(name) ||
    /\/apps\/api\/src\/audit\/persistence\/transaction-observer\.ts$/.test(name) ||
    /\/apps\/api\/src\/resources\/usage\/sessions\/active-usage\.ts$/.test(name) ||
    /\.module\.ts$/.test(name) ||
    /\/(?:apps\/plugins\/[^/]+|examples\/plugin-hello-world)\/backend\/plugin\.ts$/.test(name) ||
    // Released WAGO schema/migration entry points predate the standard filename layout.
    /\/apps\/plugins\/wago\/backend\/(?:(?:controllers|management|network)\/entity\.ts|(?:credentials|management)\/migration\.ts|commissioning\/sessions\/lease\.migration\.ts)$/.test(
      name,
    ) ||
    /\.entity\.ts$/.test(name) ||
    /\/persistence\/(?:typeorm-adapter|sqlite-[^/]+|schema|legacy-context|plugin-adapters)\.ts$/.test(name) ||
    /\/database\/conformance\//.test(name) ||
    /\/database\/(?:sqlite\/|datasource\.ts$|backend\.registry\.ts$|run-serialized-transaction\.ts$|resource-usage-integrity\.ts$)/.test(
      name,
    ) ||
    /\/auth\/session-store\/(?:sqlite|valkey)\.session-store\.ts$/.test(name) ||
    /\/metrics\/instrumentation\/db\/db\.instrumentation\.ts$/.test(name) ||
    /\/apps\/api\/src\/types\/database-entities-augment\.d\.ts$/.test(name) ||
    /\/libs\/database-entities\//.test(name) ||
    /\/libs\/plugins-backend-sdk\/src\/(?:index\.ts$|adapter\.ts$|lib\/(?:entity|plugin-migrations|plugin-context|plugin-backend-module)\.ts$|lib\/persistence\/adapter-registration\.ts$)/.test(
      name,
    )
  );
}

function rootFor(file) {
  let directory = path.dirname(file);
  for (;;) {
    if (fs.existsSync(path.join(directory, 'tsconfig.base.json'))) return directory;
    const parent = path.dirname(directory);
    if (parent === directory) return process.cwd();
    directory = parent;
  }
}

function resolver(root) {
  const configPath = path.join(root, 'tsconfig.base.json');
  const stamp = fs.existsSync(configPath) ? fs.statSync(configPath).mtimeMs : 0;
  let cached = configurations.get(configPath);
  if (!cached || cached.stamp !== stamp) {
    const config = ts.readConfigFile(configPath, ts.sys.readFile);
    cached = { stamp, options: config.error ? {} : ts.parseJsonConfigFileContent(config.config, ts.sys, root).options };
    configurations.set(configPath, cached);
  }
  const options = cached.options;
  return (request, importer) =>
    ts.resolveModuleName(request, importer, options, ts.sys).resolvedModule?.resolvedFileName;
}

/** Follow barrels as well as aliases, including type-only re-exports of imported engine symbols. */
function forbidden(request, importer, resolve, visited = new Set()) {
  if (ENGINES.test(request) || LEGACY.test(request)) return true;
  const target = resolve(request, importer);
  if (!target || target.includes('/node_modules/') || visited.has(target)) return false;
  visited.add(target);
  const name = normalized(target);
  if (/\/database\/backend\.registry\.[cm]?[jt]s$/.test(name)) return true;
  if (/\/database\/conformance\//.test(name)) return true;
  if (
    /\/libs\/database-entities\//.test(name) ||
    /\.entity\.[cm]?[jt]s$/.test(name) ||
    /\/database\/sqlite\//.test(name) ||
    /\/persistence\/(?:typeorm-adapter|sqlite-[^/]+|schema|legacy-context|plugin-adapters)\.[cm]?[jt]s$/.test(name)
  )
    return true;
  const stat = fs.statSync(target);
  let cached = sources.get(target);
  if (!cached || cached.stamp !== stat.mtimeMs || cached.size !== stat.size) {
    const text = ts.sys.readFile(target);
    if (!text) return false;
    cached = {
      stamp: stat.mtimeMs,
      size: stat.size,
      source: ts.createSourceFile(target, text, ts.ScriptTarget.Latest, true),
    };
    sources.set(target, cached);
  }
  const source = cached.source;
  const imports = new Map();
  for (const statement of source.statements) {
    if (
      ts.isImportDeclaration(statement) &&
      statement.moduleSpecifier &&
      ts.isStringLiteral(statement.moduleSpecifier)
    ) {
      const clause = statement.importClause;
      if (clause?.name) imports.set(clause.name.text, statement.moduleSpecifier.text);
      if (clause?.namedBindings) {
        if (ts.isNamespaceImport(clause.namedBindings))
          imports.set(clause.namedBindings.name.text, statement.moduleSpecifier.text);
        else
          for (const entry of clause.namedBindings.elements)
            imports.set(entry.name.text, statement.moduleSpecifier.text);
      }
    }
  }
  for (const statement of source.statements) {
    if (ts.isExportDeclaration(statement)) {
      if (
        statement.moduleSpecifier &&
        ts.isStringLiteral(statement.moduleSpecifier) &&
        forbidden(statement.moduleSpecifier.text, target, resolve, visited)
      )
        return true;
      if (!statement.moduleSpecifier && statement.exportClause && ts.isNamedExports(statement.exportClause)) {
        for (const entry of statement.exportClause.elements) {
          const from = imports.get((entry.propertyName ?? entry.name).text);
          if (from && forbidden(from, target, resolve, visited)) return true;
        }
      }
    }
    if (
      ts.isTypeAliasDeclaration(statement) &&
      statement.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      let engineAlias = false;
      const visit = (node) => {
        if (
          ts.isIdentifier(node) &&
          imports.has(node.text) &&
          forbidden(imports.get(node.text), target, resolve, visited)
        )
          engineAlias = true;
        ts.forEachChild(node, visit);
      };
      visit(statement.type);
      if (engineAlias) return true;
    }
    if (
      ts.isClassDeclaration(statement) &&
      ts.canHaveDecorators(statement) &&
      ts
        .getDecorators(statement)
        ?.some((decorator) => /^(?:\w+\.)?(?:Entity|ViewEntity)\s*\(/.test(decorator.expression.getText(source)))
    )
      return true;
  }
  return false;
}

module.exports = {
  meta: {
    type: 'problem',
    docs: { description: 'Keep database engines and decorated schemas inside persistence implementations' },
    schema: [],
    messages: {
      engine:
        'Application and transport code must use neutral records and operation ports instead of "{{source}}". Keep engine imports in an explicit adapter, schema or composition module.',
    },
  },
  create(context) {
    const file = path.resolve(context.filename ?? context.getFilename());
    if (implementation(file)) return {};
    const resolve = resolver(rootFor(file));
    const check = (node, source) => {
      // The neutral plugin factory returns only its port. The registry's raw engine selector is composition-only.
      if (
        node.type === 'ImportDeclaration' &&
        node.specifiers.length &&
        node.specifiers.every(
          (entry) => entry.type === 'ImportSpecifier' && entry.imported.name === 'createPluginMigrationPersistence',
        ) &&
        typeof source?.value === 'string' &&
        /\/database\/backend\.registry\.[cm]?[jt]s$/.test(normalized(resolve(source.value, file) ?? ''))
      )
        return;

      if (typeof source?.value === 'string' && forbidden(source.value, file, resolve))
        context.report({ node, messageId: 'engine', data: { source: source.value } });
    };
    return {
      ImportDeclaration: (node) => check(node, node.source),
      ExportNamedDeclaration: (node) => check(node, node.source),
      ExportAllDeclaration: (node) => check(node, node.source),
      ImportExpression: (node) => check(node, node.source),
      TSImportType: (node) => check(node, node.argument?.literal ?? node.argument),
      TSExternalModuleReference: (node) => check(node, node.expression),
      CallExpression: (node) => {
        if (node.callee.type === 'Identifier' && node.callee.name === 'require') check(node, node.arguments[0]);
      },
    };
  },
};
