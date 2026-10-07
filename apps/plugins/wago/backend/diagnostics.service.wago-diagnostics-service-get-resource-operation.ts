import { Resource, ResourceFlowNode } from '@attraccess/plugins-backend-sdk';
import { WagoController } from './wago-controller.entity';
import { WagoConfigurationRevision } from './wago-configuration-revision.entity';
import { type WagoConfigurationSnapshot } from './configuration';
import type { WagoResourceDiagnostics } from '../diagnostics-types';
import { diagnosticReferences } from './diagnostics.helpers';
import { WagoDiagnosticsServiceState } from './diagnostics.wago-diagnostics-service-state';
export abstract class WagoDiagnosticsServiceGetResourceOperation extends WagoDiagnosticsServiceState {
  async getResource(resourceId: number): Promise<WagoResourceDiagnostics> {
    const nodes = await this.context.dataSource
      .getRepository(ResourceFlowNode)
      .createQueryBuilder('node')
      .where('node.resourceId = :resourceId', { resourceId })
      .andWhere('node.type LIKE :type', { type: 'plugin.wago.%' })
      .orderBy('node.id', 'ASC')
      .take(1001)
      .getMany();
    const controllerIds = new Set<number>();
    let invalidControllerReferences = 0;
    for (const node of nodes.slice(0, 1000)) {
      const id = node.data.controllerId;
      if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) {
        invalidControllerReferences++;
      } else {
        controllerIds.add(id);
      }
    }
    const selectedControllerIds = [...controllerIds].slice(0, 20);
    if (!selectedControllerIds.length)
      return { resourceId, controllers: [], invalidControllerReferences, truncated: nodes.length > 1000 };

    const localNodes = nodes.slice(0, 1000);
    const localChannelIds = [
      ...new Set(
        localNodes
          .map((node) => node.data.channelId)
          .filter((channelId): channelId is string => typeof channelId === 'string'),
      ),
    ];
    const controllerIdsForQuery = selectedControllerIds;
    const [controllers, appliedRevisions, conflictNodes] = await Promise.all([
      this.context
        .getRepository(WagoController)
        .createQueryBuilder('controller')
        .select(['controller.id', 'controller.name', 'controller.hardwareId'])
        .where('controller.id IN (:...controllerIds)', { controllerIds: selectedControllerIds })
        .getMany(),
      this.context
        .getRepository(WagoConfigurationRevision)
        .createQueryBuilder('revision')
        .select(['revision.controllerId', 'revision.revision', 'revision.snapshot'])
        .where('revision.controllerId IN (:...controllerIds)', { controllerIds: selectedControllerIds })
        .andWhere('revision.state = :state', { state: 'applied' })
        .andWhere(
          'revision.revision = (SELECT MAX(applied.revision) FROM plugin_wago_configuration_revisions applied WHERE applied.controller_id = revision.controller_id AND applied.state = :state)',
        )
        .orderBy('revision.controllerId', 'ASC')
        .addOrderBy('revision.revision', 'DESC')
        .getMany(),
      localChannelIds.length
        ? this.context.dataSource
            .getRepository(ResourceFlowNode)
            .createQueryBuilder('node')
            .where("node.data ->> 'controllerId' IN (:...controllerIds)", { controllerIds: controllerIdsForQuery })
            .andWhere("node.data ->> 'channelId' IN (:...channelIds)", { channelIds: localChannelIds })
            .andWhere('node.type = :type', { type: 'plugin.wago.command' })
            .take(1001)
            .getMany()
        : Promise.resolve([]),
    ]);
    const controllersById = new Map(controllers.map((controller) => [controller.id, controller]));
    const appliedByControllerId = new Map(appliedRevisions.map((revision) => [revision.controllerId, revision]));
    const referencesTruncated = conflictNodes.length > 1000;
    const conflictNodesByControllerId = new Map<number, ResourceFlowNode[]>();
    for (const node of conflictNodes.slice(0, 1000)) {
      // This resource's own nodes are already in localNodes; including them again duplicates every reference.
      if (node.resourceId === resourceId) continue;
      const controllerId = node.data.controllerId;
      if (typeof controllerId !== 'number') continue;
      const matchingNodes = conflictNodesByControllerId.get(controllerId) ?? [];
      matchingNodes.push(node);
      conflictNodesByControllerId.set(controllerId, matchingNodes);
    }
    const conflictResourceIds = [...new Set([...conflictNodesByControllerId.values()].flat().map((n) => n.resourceId))];
    const conflictResources = conflictResourceIds.length
      ? await this.context.dataSource
          .getRepository(Resource)
          .createQueryBuilder('resource')
          .select(['resource.id', 'resource.name'])
          .where('resource.id IN (:...ids)', { ids: conflictResourceIds })
          .getMany()
      : [];
    const resourceNames = new Map(conflictResources.map((resource) => [resource.id, resource.name]));
    const controllersResult = selectedControllerIds.map((controllerId) => {
      const controller = controllersById.get(controllerId);
      if (!controller)
        return {
          controllerId,
          name: `Controller ${controllerId}`,
          unavailable: true,
          references: [],
          referencesTruncated: false,
        };
      try {
        const applied = appliedByControllerId.get(controllerId);
        const appliedSnapshot = applied ? (JSON.parse(applied.snapshot) as WagoConfigurationSnapshot) : null;
        const controllerNodes = localNodes.filter((node) => node.data.controllerId === controllerId);
        const references = diagnosticReferences(
          [...controllerNodes, ...(conflictNodesByControllerId.get(controllerId) ?? [])],
          appliedSnapshot?.logicalChannels.map((channel) => channel.id) ?? [],
          applied?.revision ?? null,
          Object.fromEntries(
            appliedSnapshot?.logicalChannels.map((channel) => [channel.id, channel.capabilities]) ?? [],
          ),
        )
          .filter((reference) => reference.resourceId === resourceId)
          .map((reference) => ({
            ...reference,
            conflictResources: reference.conflictResourceIds.map((id) => ({
              id,
              name: resourceNames.get(id) ?? `Resource ${id}`,
            })),
          }));
        return {
          controllerId,
          name: controller.name ?? controller.hardwareId,
          unavailable: false,
          references,
          referencesTruncated,
        };
      } catch {
        return {
          controllerId,
          name: controller.name ?? controller.hardwareId,
          unavailable: true,
          references: [],
          referencesTruncated: false,
        };
      }
    });
    return {
      resourceId,
      controllers: controllersResult,
      invalidControllerReferences,
      truncated: nodes.length > 1000 || controllerIds.size > 20,
    };
  }
}
