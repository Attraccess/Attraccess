/* eslint-disable no-console -- CLI diagnostics are intentional. */
import { lstatSync, readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { excludedDirectory, generatedClients, git, readBlobs } from './lib/repo-files.mjs';

const sourceFile = /^(apps|libs)\/.*\.(?:[cm]?ts|tsx)$/;

// TypeORM bidirectional relations reference each other through lazy `() => Entity`
// thunks, so a cycle made only of entity files is resolved at runtime and allowed.
// Not every entity file uses the `.entity.ts` suffix (e.g. `form.ts`, `project.ts`),
// so an entity is a file in the entities directory that declares an `@Entity`,
// `@ChildEntity` or `@ViewEntity` class. A cycle that also passes through any other
// file, such as a schema helper in the same directory, is still reported.
const entityDirectory = /^libs\/database-entities\/src\/lib\/entities\/(?!.*\.spec\.ts$).*\.ts$/;
const entityDecorator = /@(?:Entity|ChildEntity|ViewEntity)\(/;

function exemptCycleMember(file, content) {
  return entityDirectory.test(file) && entityDecorator.test(content);
}

function checked(file) {
  return (
    sourceFile.test(file) && !file.endsWith('.d.ts') && !excludedDirectory.test(file) && !generatedClients.test(file)
  );
}

function stagedSources() {
  const files = git(['ls-files', '--stage', '-z'])
    .split('\0')
    .filter(Boolean)
    .map((entry) => {
      const tab = entry.indexOf('\t');
      const [mode, oid, stage] = entry.slice(0, tab).split(' ');
      if (stage !== '0') throw new Error('Resolve merge conflicts before checking import cycles.');
      return { file: entry.slice(tab + 1), mode, oid };
    })
    .filter(({ file, mode }) => /^100/.test(mode) && checked(file));
  return readBlobs(files);
}

function workingTreeSources() {
  const result = new Map();
  for (const file of git(['ls-files', '--cached', '--others', '--exclude-standard', '-z']).split('\0')) {
    if (!checked(file)) continue;
    try {
      if (lstatSync(file).isFile()) result.set(file, readFileSync(file, 'utf8'));
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  return result;
}

function compilerOptions() {
  const { config, error } = ts.readConfigFile('tsconfig.base.json', (file) => readFileSync(file, 'utf8'));
  if (error) throw new Error(ts.flattenDiagnosticMessageText(error.messageText, '\n'));
  return ts.parseJsonConfigFileContent({ compilerOptions: config.compilerOptions, files: [] }, ts.sys, process.cwd())
    .options;
}

function requireCall(expression) {
  return expression &&
    ts.isCallExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    expression.expression.text === 'require' &&
    expression.arguments.length === 1 &&
    ts.isStringLiteralLike(expression.arguments[0])
    ? expression.arguments[0].text
    : undefined;
}

// `const x = require('./x')` and `require('./x')` at the top level run at module load.
function topLevelRequires(statement) {
  const expressions = ts.isExpressionStatement(statement)
    ? [statement.expression]
    : ts.isVariableStatement(statement)
      ? statement.declarationList.declarations.map((declaration) => declaration.initializer)
      : [];
  return expressions.map(requireCall).filter(Boolean);
}

// Only imports evaluated at module load count: type-only imports are erased, and
// dynamic `import()` and a `require()` inside a function run after both modules have
// finished initialising.
function runtimeSpecifiers(file, content) {
  const kind = file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, false, kind);
  const specifiers = [];
  for (const statement of source.statements) {
    if (ts.isImportDeclaration(statement)) {
      const clause = statement.importClause;
      const typeOnly =
        clause &&
        (clause.isTypeOnly ||
          (!clause.name &&
            clause.namedBindings &&
            ts.isNamedImports(clause.namedBindings) &&
            clause.namedBindings.elements.length > 0 &&
            clause.namedBindings.elements.every((element) => element.isTypeOnly)));
      if (!typeOnly) specifiers.push(statement.moduleSpecifier.text);
    } else if (ts.isExportDeclaration(statement) && statement.moduleSpecifier) {
      const clause = statement.exportClause;
      const typeOnly =
        statement.isTypeOnly ||
        (clause &&
          ts.isNamedExports(clause) &&
          clause.elements.length > 0 &&
          clause.elements.every((element) => element.isTypeOnly));
      if (!typeOnly) specifiers.push(statement.moduleSpecifier.text);
    } else if (
      ts.isImportEqualsDeclaration(statement) &&
      !statement.isTypeOnly &&
      ts.isExternalModuleReference(statement.moduleReference) &&
      ts.isStringLiteral(statement.moduleReference.expression)
    ) {
      specifiers.push(statement.moduleReference.expression.text);
    } else {
      specifiers.push(...topLevelRequires(statement));
    }
  }
  return specifiers;
}

function importGraph(sources) {
  const options = compilerOptions();
  const cache = ts.createModuleResolutionCache(process.cwd(), (name) => name, options);
  const root = process.cwd();
  // Checked sources resolve against the set being checked, so `--staged` ignores unstaged files.
  const host = {
    ...ts.sys,
    fileExists: (file) => {
      const relative = path.relative(root, file).split(path.sep).join('/');
      return checked(relative) ? sources.has(relative) : ts.sys.fileExists(file);
    },
  };
  const graph = new Map();
  for (const [file, content] of sources) {
    const targets = new Set();
    for (const specifier of runtimeSpecifiers(file, content)) {
      const { resolvedModule } = ts.resolveModuleName(specifier, path.join(root, file), options, host, cache);
      if (!resolvedModule) continue;
      const target = path.relative(root, resolvedModule.resolvedFileName).split(path.sep).join('/');
      if (sources.has(target)) targets.add(target);
    }
    graph.set(file, [...targets].sort());
  }
  return graph;
}

// Tarjan's algorithm, iterative so deep import chains cannot overflow the stack.
function stronglyConnectedComponents(graph) {
  const index = new Map();
  const low = new Map();
  const onStack = new Set();
  const stack = [];
  const components = [];
  let next = 0;
  for (const start of graph.keys()) {
    if (index.has(start)) continue;
    const work = [[start, 0]];
    index.set(start, next);
    low.set(start, next++);
    stack.push(start);
    onStack.add(start);
    while (work.length) {
      const frame = work[work.length - 1];
      const [node, edge] = frame;
      const targets = graph.get(node);
      if (edge < targets.length) {
        frame[1]++;
        const target = targets[edge];
        if (!index.has(target)) {
          index.set(target, next);
          low.set(target, next++);
          stack.push(target);
          onStack.add(target);
          work.push([target, 0]);
        } else if (onStack.has(target)) {
          low.set(node, Math.min(low.get(node), index.get(target)));
        }
        continue;
      }
      work.pop();
      if (work.length) {
        const parent = work[work.length - 1][0];
        low.set(parent, Math.min(low.get(parent), low.get(node)));
      }
      if (low.get(node) === index.get(node)) {
        const component = [];
        let member;
        do {
          member = stack.pop();
          onStack.delete(member);
          component.push(member);
        } while (member !== node);
        if (component.length > 1 || targets.includes(node)) components.push(new Set(component));
      }
    }
  }
  return components;
}

function shortestCycleThrough(graph, component, start) {
  const previous = new Map([[start, null]]);
  const queue = [start];
  for (let i = 0; i < queue.length; i++) {
    const node = queue[i];
    for (const target of graph.get(node)) {
      if (!component.has(target)) continue;
      if (target === start) {
        const chain = [];
        for (let step = node; step !== null; step = previous.get(step)) chain.unshift(step);
        return chain;
      }
      if (!previous.has(target)) {
        previous.set(target, node);
        queue.push(target);
      }
    }
  }
  return [start];
}

// One shortest cycle per non-exempt file is enough to name every offending file
// without enumerating every elementary cycle of a large tangle.
function reportedCycles(graph, sources) {
  const cycles = new Map();
  for (const component of stronglyConnectedComponents(graph)) {
    for (const file of [...component].sort()) {
      if (exemptCycleMember(file, sources.get(file))) continue;
      const cycle = shortestCycleThrough(graph, component, file);
      const first = cycle.indexOf([...cycle].sort()[0]);
      const canonical = [...cycle.slice(first), ...cycle.slice(0, first)];
      cycles.set(canonical.join('\0'), canonical);
    }
  }
  return [...cycles.values()].sort((a, b) => a.join('\0').localeCompare(b.join('\0')));
}

function check() {
  let staged = false;
  for (const arg of process.argv.slice(2)) {
    if (arg === '--staged') staged = true;
    else throw new Error('Usage: node scripts/check-import-cycles.mjs [--staged]');
  }
  process.chdir(git(['rev-parse', '--show-toplevel']).trim());
  const sources = staged ? stagedSources() : workingTreeSources();
  const cycles = reportedCycles(importGraph(sources), sources);
  for (const cycle of cycles) console.error([...cycle, cycle[0]].join('\n  -> ') + '\n');
  if (cycles.length) {
    console.error(
      `Found ${cycles.length} runtime import cycle(s). Move shared code into a leaf module, ` +
        'pass the dependency in as a prop or callback, or use `import type` when only types are needed. ' +
        'See "Import cycles" in CONTRIBUTING.md.',
    );
    process.exitCode = 1;
  } else {
    console.log(`Import cycle check passed (${sources.size} files).`);
  }
}

try {
  check();
} catch (error) {
  console.error(`Import cycle check failed: ${error.message}`);
  process.exitCode = 1;
}
