import { BadRequestException } from '@nestjs/common';
import * as semver from 'semver';
import { z } from 'zod';

export const PluginDependencySchema = z.object({
  name: z.string().regex(/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/, 'must be an npm package identity'),
  version: z.string().refine((range) => Boolean(range.trim() && semver.validRange(range)), 'must be a semver range'),
  required: z.boolean().default(true),
});
export const PluginDependenciesSchema = z
  .array(PluginDependencySchema)
  .default([])
  .refine(
    (dependencies) => new Set(dependencies.map(({ name }) => name)).size === dependencies.length,
    'duplicate plugin dependency identity',
  );
export type PluginDependency = z.infer<typeof PluginDependencySchema>;
export type DependencyPlugin = { name: string; version: string; dependencies?: PluginDependency[] };

/** Required edges only: optional plugins are neither installed nor needed for activation. */
export function orderPluginDependencies<T extends DependencyPlugin>(plugins: T[]): T[] {
  const byName = new Map(plugins.map((plugin) => [plugin.name, plugin]));
  if (byName.size !== plugins.length) throw new BadRequestException('Duplicate installed plugin identity');
  const ordered: T[] = [];
  const visited = new Set<string>();
  const visiting: string[] = [];
  const visit = (plugin: T) => {
    if (visited.has(plugin.name)) return;
    if (visiting.includes(plugin.name))
      throw new BadRequestException(`Plugin dependency cycle: ${[...visiting, plugin.name].join(' → ')}`);
    visiting.push(plugin.name);
    for (const dependency of plugin.dependencies ?? []) {
      const installed = byName.get(dependency.name);
      if (!installed && !dependency.required) continue;
      if (!installed || !semver.satisfies(installed.version, dependency.version))
        throw new BadRequestException(
          `${plugin.name}@${plugin.version} requires ${dependency.name}@${dependency.version}${installed ? `; installed version is ${installed.version}` : '; plugin is missing'}`,
        );
      if (dependency.required) visit(installed);
    }
    visiting.pop();
    visited.add(plugin.name);
    ordered.push(plugin);
  };
  plugins.forEach(visit);
  return ordered;
}

/** Backtracks across available versions, including shared transitive requirements. */
export async function resolvePluginDependencies<T extends DependencyPlugin>(
  root: T,
  installed: T[],
  candidates: (name: string, ranges: string[]) => Promise<T[]> | AsyncIterable<T>,
): Promise<T[]> {
  const fixed = new Map(installed.filter(({ name }) => name !== root.name).map((plugin) => [plugin.name, plugin]));
  fixed.set(root.name, root);
  const cache = new Map<string, { plugins: T[]; iterator: Iterator<T> | AsyncIterator<T>; done: boolean }>();
  const matchingCandidates = async function* (name: string, ranges: string[]): AsyncGenerator<T> {
    const key = JSON.stringify([name, ...new Set(ranges.sort())]);
    if (!cache.has(key)) {
      const source = await candidates(name, ranges);
      cache.set(key, {
        plugins: [],
        iterator: Array.isArray(source) ? source[Symbol.iterator]() : source[Symbol.asyncIterator](),
        done: false,
      });
    }
    const entry = cache.get(key);
    for (let index = 0; ; index++) {
      if (index === entry.plugins.length && !entry.done) {
        const next = await entry.iterator.next();
        if (next.done) entry.done = true;
        else entry.plugins.push(next.value);
      }
      if (index === entry.plugins.length) return;
      const plugin = entry.plugins[index];
      if (ranges.every((range) => semver.satisfies(plugin.version, range))) yield plugin;
    }
  };
  let attempts = 0;
  const solve = async (selected: Map<string, T>): Promise<T[]> => {
    if (++attempts > 1000 || selected.size > 100)
      throw new BadRequestException('Plugin dependency graph exceeds resolution limits');
    const constraints = new Map<string, Array<{ range: string; from: string }>>();
    for (const plugin of selected.values()) {
      for (const dependency of plugin.dependencies ?? []) {
        if (!dependency.required && !selected.has(dependency.name)) continue;
        const requirements = constraints.get(dependency.name) ?? [];
        requirements.push({ range: dependency.version, from: plugin.name });
        constraints.set(dependency.name, requirements);
      }
    }
    for (const [name, requirements] of constraints) {
      const chosen = selected.get(name);
      const explanation = requirements.map(({ from, range }) => `${from} requires ${name}@${range}`).join('; ');
      if (chosen) {
        if (requirements.some(({ range }) => !semver.satisfies(chosen.version, range)))
          throw new BadRequestException(
            `Incompatible plugin dependencies: ${explanation}; selected version is ${chosen.version}. Change the conflicting plugin versions first.`,
          );
        continue;
      }
      let lastError: unknown;
      for await (const option of matchingCandidates(
        name,
        requirements.map(({ range }) => range),
      )) {
        try {
          return await solve(new Map([...selected, [name, option]]));
        } catch (error) {
          lastError = error;
        }
      }
      if (lastError) throw lastError;
      throw new BadRequestException(
        `No compatible plugin version: ${explanation}. Check the registry and plugin versions.`,
      );
    }
    const ordered = orderPluginDependencies([...selected.values()]);
    const reachable = new Set<string>();
    const collect = (plugin: T) => {
      if (reachable.has(plugin.name)) return;
      reachable.add(plugin.name);
      for (const dependency of plugin.dependencies ?? []) {
        if (dependency.required) collect(selected.get(dependency.name));
      }
    };
    collect(root);
    return ordered.filter(({ name }) => reachable.has(name) || !fixed.has(name));
  };
  return solve(fixed);
}

export function pluginRemovalClosure<T extends DependencyPlugin>(name: string, installed: T[]): T[] {
  const names = new Set([name]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const plugin of installed) {
      if (
        !names.has(plugin.name) &&
        plugin.dependencies?.some((dependency) => dependency.required && names.has(dependency.name))
      ) {
        names.add(plugin.name);
        changed = true;
      }
    }
  }
  return installed.filter((plugin) => names.has(plugin.name));
}

/** Keep invalid components inactive without stopping unrelated plugins. */
export function pluginActivationPlan<T extends DependencyPlugin>(
  plugins: T[],
): { ordered: T[]; failures: Map<string, Error> } {
  const byName = new Map(plugins.map((plugin) => [plugin.name, plugin]));
  const ordered = new Map<string, T>();
  const failures = new Map<string, Error>();
  for (const plugin of plugins) {
    const closure = new Map<string, T>();
    const collect = (current: T) => {
      if (closure.has(current.name)) return;
      closure.set(current.name, current);
      for (const dependency of current.dependencies ?? []) {
        const target = byName.get(dependency.name);
        if (dependency.required && target) collect(target);
      }
    };
    collect(plugin);
    try {
      for (const current of closure.values()) {
        for (const dependency of current.dependencies ?? []) {
          const optional = !dependency.required && byName.get(dependency.name);
          if (optional && !semver.satisfies(optional.version, dependency.version))
            throw new BadRequestException(
              `${current.name} requires optional plugin ${dependency.name}@${dependency.version}; installed version is ${optional.version}`,
            );
        }
      }
      for (const entry of orderPluginDependencies([...closure.values()])) ordered.set(entry.name, entry);
    } catch (error) {
      failures.set(plugin.name, error as Error);
    }
  }
  return { ordered: [...ordered.values()].filter(({ name }) => !failures.has(name)), failures };
}
