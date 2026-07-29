import { ReactNode } from 'react';

// Generic, host-agnostic extension-point mechanism.
//
// The host renders named "slots" at well-known points in its UI and hands each
// slot a context object describing where it is being mounted. Plugins return
// contributions for the slots they care about via
// `AttraccessFrontendPlugin.getSlotContributions()`, and the host renders each
// contribution's `render(context)` inside an error boundary.
//
// The host owns both the concrete slot ids and the shape of the context it
// passes per slot — this contract stays deliberately agnostic about both, so no
// domain knowledge (RabbitMQ, MQTT, or anything else) leaks into the SDK. A slot
// id is just a documented string the host exposes, exactly like a route `path`.

// Identifies a host extension point. The host defines the concrete ids it
// exposes and documents the context shape for each.
export type PluginSlotId = string;

// Opaque, host-supplied context passed to a contribution at render time. The
// host documents the keys it provides per slot; plugins narrow as needed.
export type PluginSlotContext = Record<string, unknown>;

// A single contribution into a host slot. `Context` lets a plugin type its
// `render` against the exact shape the host documents for that slot (e.g. the
// MQTT slots' `{ mqttServerId: number }`), so no runtime casting is needed. It
// defaults to the opaque `PluginSlotContext`, and a contribution typed to a
// narrower context is still assignable to `PluginSlotContribution[]` (the
// return type of `getSlotContributions`), so a plugin can mix differently-typed
// contributions in one array while keeping each `render` strongly typed.
export interface PluginSlotContribution<Context extends PluginSlotContext = PluginSlotContext> {
  // The slot this contribution targets (must match a host slot id).
  slotId: PluginSlotId;
  // Optional stable key. Useful both as a React key when a plugin contributes
  // to a slot the host mounts many times (e.g. once per list row) and as a
  // stable identifier for the contribution in host error logs.
  key?: string;
  // Render the contributed UI for one mount of the slot, given its context.
  render(context: Context): ReactNode;
}
