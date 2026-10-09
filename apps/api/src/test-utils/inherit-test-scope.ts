/** Retain live outer fixture state across nested test registrations. */
export function inheritTestScope<Local extends object, Parent extends object>(
  local: Local,
  parent: Parent,
): Local & Parent {
  return new Proxy(local, {
    get(target, property, receiver) {
      const own = Object.getOwnPropertyDescriptor(target, property);
      return own && (own.get || 'value' in own)
        ? Reflect.get(target, property, receiver)
        : Reflect.get(parent, property);
    },
    set(target, property, value, receiver) {
      return Reflect.has(target, property)
        ? Reflect.set(target, property, value, receiver)
        : Reflect.set(parent, property, value);
    },
  }) as Local & Parent;
}
