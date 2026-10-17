/** Keep framework method discovery in the facade's original declaration order. */
export function installInheritedMethods(target: { prototype: object }, names: readonly string[]): void {
  const descriptors = new Map<string, PropertyDescriptor>();
  for (const name of names) {
    let prototype = target.prototype;
    while (prototype) {
      const descriptor = Object.getOwnPropertyDescriptor(prototype, name);
      if (descriptor) {
        descriptors.set(name, descriptor);
        break;
      }
      prototype = Object.getPrototypeOf(prototype);
    }
    if (!descriptors.has(name)) throw new Error(`Missing inherited implementation: ${name}`);
  }
  for (const name of names) Reflect.deleteProperty(target.prototype, name);
  for (const name of names) Object.defineProperty(target.prototype, name, descriptors.get(name));
}
