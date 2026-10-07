import * as fs from 'fs';
import * as path from 'path';

export function stylesheetPath(specifier: string, base: string): string {
  const candidate = specifier.startsWith('.') ? path.resolve(base, specifier) : findPackageStylesheet(specifier, base);
  const packageJson = path.join(candidate, 'package.json');
  const packageStyle = fs.existsSync(packageJson)
    ? (() => {
        const pkg = JSON.parse(fs.readFileSync(packageJson, 'utf8')) as {
          exports?: { '.': { style?: string } };
          main?: string;
        };
        return pkg.exports?.['.']?.style ?? pkg.main;
      })()
    : undefined;
  for (const file of [
    candidate,
    `${candidate}.css`,
    path.join(candidate, 'index.css'),
    packageStyle && path.join(candidate, packageStyle),
  ]) {
    if (file && fs.existsSync(file) && fs.statSync(file).isFile()) return fs.realpathSync(file);
  }
  throw new Error(`Cannot resolve stylesheet ${specifier} from ${base}`);
}

export function findPackageStylesheet(specifier: string, from: string): string {
  for (let dir = from; ; dir = path.dirname(dir)) {
    for (const packageDir of [
      path.join(dir, 'node_modules', specifier),
      path.basename(dir) === 'node_modules' && path.join(dir, specifier),
    ]) {
      if (packageDir && fs.existsSync(packageDir)) return packageDir;
    }
    if (path.dirname(dir) === dir) break;
  }
  throw new Error(`Cannot resolve package stylesheet ${specifier} from ${from}`);
}

export function emitsCss(compiled: { build(candidates: string[]): string }, className: string): boolean {
  // build() caches candidates. Compare the output before adding this candidate so each
  // literal is tested independently without recompiling the entire HeroUI theme.
  const before = compiled.build([]);
  return compiled.build([className]) !== before;
}
