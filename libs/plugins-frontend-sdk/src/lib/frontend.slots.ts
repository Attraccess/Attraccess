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

export interface PluginSlotContribution {
  // The slot this contribution targets (must match a host slot id).
  slotId: PluginSlotId;
  // Optional stable React key, useful when a plugin contributes to a slot that
  // the host mounts many times (e.g. once per list row).
  key?: string;
  // Render the contributed UI for one mount of the slot, given its context.
  render(context: PluginSlotContext): ReactNode;
}
