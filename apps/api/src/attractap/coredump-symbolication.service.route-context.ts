export abstract class CoredumpSymbolicationServiceRouteContext {
  protected abstract findExecutableOnPath(command: string): string | null;
}
