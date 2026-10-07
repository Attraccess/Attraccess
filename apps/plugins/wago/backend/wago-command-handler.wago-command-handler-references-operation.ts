import { ResourceFlowNode } from '@attraccess/plugins-backend-sdk';
import { WagoCommandHandlerDestroyOperation } from './wago-command-handler.wago-command-handler-destroy-operation';


export abstract class WagoCommandHandlerReferencesOperation extends WagoCommandHandlerDestroyOperation {
  protected async references(controllerId: number, channelId: string, resourceId: number): Promise<string[]> {
    const nodes = await this.dependencies.context.dataSource
      .getRepository(ResourceFlowNode)
      .createQueryBuilder('node')
      .select(['node.id', 'node.resourceId'])
      .where('node.type = :type', { type: 'plugin.wago.command' })
      .andWhere('node.resourceId <> :resourceId', { resourceId })
      .andWhere("node.data ->> 'controllerId' = :controllerId", { controllerId })
      .andWhere("node.data ->> 'channelId' = :channelId", { channelId })
      .getMany();
    return nodes.map((node) => `resource ${node.resourceId} / node ${node.id}`);
  }
}
