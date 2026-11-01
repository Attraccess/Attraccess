/** Reasons the host gives as fixed codes; each has a `reader.reason.<code>` translation. */
const HOST_REASONS = new Set([
  'old-firmware',
  'no-screen',
  'crash-loop-suspended',
  'widgets-disabled',
  'unsupported',
  'expired',
  'too-many-contributions',
  'provider-error',
  'node-budget',
  // A provider answer that is no list, or a null entry in it.
  'invalid',
]);

/** `invalid-<validator reason>` and `reader-<reader drop reason>` carry a technical detail after the prefix. */
const PREFIXED_REASONS = ['invalid', 'reader'];

export interface ReasonLabel {
  /** Translation key of the readable reason; absent for reasons this UI doesn't know. */
  key?: string;
  /** Technical detail, shown as secondary text. */
  detail?: string;
}

export function reasonLabel(reason: string): ReasonLabel {
  if (HOST_REASONS.has(reason)) return { key: `reader.reason.${reason}` };
  const prefix = PREFIXED_REASONS.find((p) => reason.startsWith(`${p}-`));
  if (prefix) return { key: `reader.reason.${prefix}`, detail: reason.slice(prefix.length + 1) };
  return { detail: reason };
}

const SLOT_KEYS: Record<string, string> = {
  'resourceList.row.status': 'listRow',
  'resource.details.header': 'detailsHeader',
  'resource.details.body': 'detailsBody',
  'resource.details.session': 'detailsSession',
  // Pseudo-slots for a whole plugin skipped on this reader.
  provider: 'allWidgets',
  widgets: 'allWidgets',
};

/** Translation key of a slot name, or null for an unknown slot (shown as sent). */
export function slotLabelKey(slot: string): string | null {
  return Object.hasOwn(SLOT_KEYS, slot) ? `reader.slot.${SLOT_KEYS[slot]}` : null;
}
