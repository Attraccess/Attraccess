import type {
  PreStartContext,
  ReaderSlotContribution,
  ReaderUiContext,
  ReaderUiProvider,
  PreStartResult,
  SessionEndContext,
  SessionEndResult,
  StartBlockedContext,
  StartBlockedState,
} from '@attraccess/plugins-backend-sdk';

/** The services the host-called hooks delegate to; `deadline` is an epoch-ms bound for their waits. */
export interface HookServices {
  preStart: {
    evaluate(ctx: PreStartContext, deadline?: number): Promise<PreStartResult>;
    evaluateStartBlocked(ctx: StartBlockedContext, deadline?: number): Promise<StartBlockedState | null>;
  };
  sessionEnd: { evaluate(ctx: SessionEndContext, deadline?: number): Promise<SessionEndResult> };
  readerUi: { getSlotContributions(ctx: ReaderUiContext, deadline?: number): Promise<ReaderSlotContribution[]> };
}

/**
 * Total time a hook call may spend WAITING (module boot, then settings cache warm-up). One budget for
 * both, well under the host's 1.5 s hook timeout, so the remaining work (one indexed query) still fits.
 */
export const HOOK_BUDGET_MS = 1200;

/** Epoch-ms deadline for a hook call starting now. */
export const hookDeadline = (): number => Date.now() + HOOK_BUDGET_MS;

/** Awaits `work`, rejecting with `message` once `deadline` (epoch ms) has passed. */
export async function waitUntil<T>(work: Promise<T>, deadline: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), Math.max(0, deadline - Date.now()));
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

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

const NOT_READY = 'The reservations plugin is not ready yet';

/** Resolves the services, waiting until `deadline` (epoch ms) for a module that is still booting. */
export async function resolveHookServices(deadline = hookDeadline()): Promise<HookServices> {
  if (current) return current;
  await waitUntil(readyPromise(), deadline, NOT_READY).catch(() => undefined);
  if (!current) throw new Error(NOT_READY);
  return current;
}

/**
 * `PluginBackendModule.preStartHook`. Waiting for the module and for the settings cache share one
 * HOOK_BUDGET_MS deadline; past it the hook throws and the host applies its failure policy.
 */
export async function preStartHook(ctx: PreStartContext): Promise<PreStartResult> {
  const deadline = hookDeadline();
  return (await resolveHookServices(deadline)).preStart.evaluate(ctx, deadline);
}

/** `PluginBackendModule.sessionEndHook` (same shared deadline). */
export async function sessionEndHook(ctx: SessionEndContext): Promise<SessionEndResult> {
  const deadline = hookDeadline();
  return (await resolveHookServices(deadline)).sessionEnd.evaluate(ctx, deadline);
}

/** `PluginBackendModule.startBlockedQuery`: the UI-facing twin of the pre-start block (same shared deadline). */
export async function startBlockedQuery(ctx: StartBlockedContext): Promise<StartBlockedState | null> {
  const deadline = hookDeadline();
  return (await resolveHookServices(deadline)).preStart.evaluateStartBlocked(ctx, deadline);
}

/** `PluginBackendModule.readerUi`: slot contributions for Attractap readers (same shared deadline). */
export const readerUiProvider: ReaderUiProvider = {
  async getSlotContributions(ctx: ReaderUiContext): Promise<ReaderSlotContribution[]> {
    const deadline = hookDeadline();
    return (await resolveHookServices(deadline)).readerUi.getSlotContributions(ctx, deadline);
  },
};
