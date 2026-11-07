import type {
  PreStartContext,
  PreStartResult,
  SessionEndContext,
  SessionEndResult,
} from '@attraccess/plugins-backend-sdk';

/** The two services the host-called hooks delegate to. */
export interface HookServices {
  preStart: { evaluate(ctx: PreStartContext): Promise<PreStartResult> };
  sessionEnd: { evaluate(ctx: SessionEndContext): Promise<SessionEndResult> };
}

/** How long a hook waits for the plugin module to finish booting (the host allows 1.5 s per hook). */
export const READY_BUDGET_MS = 900;

/**
 * The host calls `preStartHook` / `sessionEndHook` as plain functions of the plugin object, with a
 * context that carries no services. The Nest module therefore publishes its services here when it
 * initialises (and withdraws them on destroy); the hooks resolve them lazily.
 *
 * Module-level state is safe: the host loads one instance of this plugin per process.
 */
let current: HookServices | null = null;
let notifyReady: (() => void) | null = null;
let ready: Promise<void> | null = null;

function readyPromise(): Promise<void> {
  ready ??= new Promise<void>((resolve) => {
    notifyReady = resolve;
  });
  return ready;
}

export function publishHookServices(services: HookServices | null): void {
  current = services;
  if (services) {
    readyPromise();
    notifyReady?.();
  } else {
    ready = null;
    notifyReady = null;
  }
}

/** Resolves the services, waiting up to `budgetMs` for a module that is still booting. */
export async function resolveHookServices(budgetMs = READY_BUDGET_MS): Promise<HookServices> {
  if (current) return current;
  let timer: NodeJS.Timeout | undefined;
  await Promise.race([
    readyPromise(),
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, budgetMs);
    }),
  ]);
  clearTimeout(timer);
  if (!current) throw new Error('The reservations plugin is not ready yet');
  return current;
}

/** `PluginBackendModule.preStartHook`. Throws while not ready: the host applies its failure policy. */
export async function preStartHook(ctx: PreStartContext): Promise<PreStartResult> {
  return (await resolveHookServices()).preStart.evaluate(ctx);
}

/** `PluginBackendModule.sessionEndHook`. */
export async function sessionEndHook(ctx: SessionEndContext): Promise<SessionEndResult> {
  return (await resolveHookServices()).sessionEnd.evaluate(ctx);
}
