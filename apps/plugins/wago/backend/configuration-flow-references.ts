import { ResourceFlowNode, type PluginContext } from '@attraccess/plugins-backend-sdk';
import type { WagoConfigurationSnapshot } from './configuration';
import { configurationImpacts } from './configuration-editor';

export async function configurationFlowImpacts(
  context: PluginContext,
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
  const nodes = await context.dataSource
    .getRepository(ResourceFlowNode)
    .createQueryBuilder('node')
    .select(['node.id', 'node.resourceId', 'node.type', 'node.data'])
    .where('node.type LIKE :type', { type: 'plugin.wago.%' })
    .andWhere("node.data ->> 'controllerId' = :controllerId", { controllerId })
    .getMany();
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
