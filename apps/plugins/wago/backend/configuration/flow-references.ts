import type { WagoConfigurationPersistence } from './persistence/port';
import type { WagoConfigurationSnapshot } from './model';
import { configurationImpacts } from './editor';

export async function configurationFlowImpacts(
  persistence: WagoConfigurationPersistence,
  controllerId: number,
  previous: WagoConfigurationSnapshot | null,
  current: WagoConfigurationSnapshot,
) {
  const impacts = configurationImpacts(previous, current);
  const affected = new Set(impacts.map((impact) => impact.channelId));
  // A changed guard or feedback input also changes the behavior of its consumers.
  for (const channel of previous?.logicalChannels ?? []) {
    if (
      !affected.has(channel.id) &&
      ((channel.guard && affected.has(channel.guard.channelId)) ||
        (channel.feedback && affected.has(channel.feedback.channelId)))
    ) {
      affected.add(channel.id);
      impacts.push({ channelId: channel.id, message: 'An input used by this channel as a guard or feedback changed.' });
    }
  }
  const nodes = await persistence.flowReferences(controllerId);
  // Commands pin the applied revision, even when their channel is unchanged.
  for (const node of nodes) {
    const channelId = node.data?.channelId;
    if (String(node.type) !== 'plugin.wago.command' || typeof channelId !== 'string' || !channelId) continue;
    const message =
      "Publication changes the configuration revision. Reopen and save this channel's command nodes after it applies.";
    const impact = impacts.find((item) => item.channelId === channelId);
    if (impact) {
      if (!impact.message.includes(message)) impact.message += ` ${message}`;
    } else impacts.push({ channelId, message });
  }
  return impacts.map((impact) => ({
    ...impact,
    references: nodes
      .filter((node) => node.data?.channelId === impact.channelId)
      .map((node) => ({ resourceId: node.resourceId, nodeId: node.id, nodeType: node.type })),
  }));
}
