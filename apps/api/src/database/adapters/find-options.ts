import type { FindOptionsRelations, FindOptionsSelect } from 'typeorm';

type Tree = { [key: string]: true | Tree };

/** Turns dotted names (`'a'`, `'a.b'`) into the nested object form of TypeORM 1.x find options. */
function toTree(names: readonly string[]): Tree {
  const tree: Tree = {};
  for (const name of names) {
    const parts = name.split('.');
    let node = tree;
    parts.forEach((part, index) => {
      if (index === parts.length - 1) {
        if (typeof node[part] !== 'object') node[part] = true;
        return;
      }
      if (typeof node[part] !== 'object') node[part] = {};
      node = node[part] as Tree;
    });
  }
  return tree;
}

/** The relations a port names as strings, in TypeORM's find-option form. */
export function findRelations<T = unknown>(names: readonly string[] | undefined): FindOptionsRelations<T> | undefined {
  return names === undefined ? undefined : (toTree(names) as FindOptionsRelations<T>);
}

/** The columns a port names as strings, in TypeORM's find-option form. */
export function findSelect<T = unknown>(names: readonly string[]): FindOptionsSelect<T> {
  return toTree(names) as FindOptionsSelect<T>;
}
