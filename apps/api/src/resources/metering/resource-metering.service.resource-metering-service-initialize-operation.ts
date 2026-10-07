import { BadRequestException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { In } from 'typeorm';
import { ResourceFlowNodeType, ResourceMeteringSessionStatus, ResourceUsage } from '@attraccess/database-entities';
import { ResourceMeteringServiceGetDefinitionOperation } from './resource-metering.service.resource-metering-service-get-definition-operation';
export abstract class ResourceMeteringServiceInitializeOperation extends ResourceMeteringServiceGetDefinitionOperation {
  // ---- lifecycle --------------------------------------------------------------------------------

  /**
   * Establishes the metering session for a (still tentative) usage. Throws when the meter is missing or
   * does not acknowledge, so an unmetered billed session can never start.
   * `supersedes` is the usage of a takeover's outgoing session: its meter is about to be re-initialized.
   */
  async initialize(input: { resourceId: number; usageId: number; supersedes?: number }): Promise<void> {
    const usage = await this.sessions.manager.findOneOrFail(ResourceUsage, { where: { id: input.usageId } });
    const meters =
      usage.meterRates ??
      (await this.meters.find({ where: { resourceId: input.resourceId } })).map((m) => ({
        meterId: m.id,
        name: m.name,
        creditsPerUnit: m.creditsPerUnit,
      }));
    const initializedMeters = new Set<number>();
    try {
      for (const meter of meters) {
        const definition = await this.getDefinition(input.resourceId, meter.meterId);
        if (!definition.configured && meter.creditsPerUnit > 0) {
          throw new BadRequestException(`METER_NOT_CONFIGURED: ${meter.name}`, {
            description: definition.problems.join(', '),
          });
        }
        if (!definition.configured) continue;
        const session = await this.sessions.save({
          id: randomUUID(),
          resourceId: input.resourceId,
          usageId: input.usageId,
          meterId: meter.meterId,
          meterName: meter.name,
          status: ResourceMeteringSessionStatus.Active,
          creditsPerUnit: meter.creditsPerUnit,
          collectionMode: definition.incrementOnly ? 'increment' : 'requested',
          latestValue: definition.incrementOnly ? '0' : null,
        });
        if (!definition.incrementOnly) {
          // Once initialization is issued, the device may reset even without a reply.
          // Increment-only meters dispatch no start branch and retain their outgoing evidence.
          initializedMeters.add(meter.meterId);
          try {
            await this.runOperation(session, 'start', {
              trigger: ResourceFlowNodeType.INPUT_METERING_START,
              timeoutSeconds: definition.start.timeoutSeconds,
            });
          } catch (error) {
            if (meter.creditsPerUnit > 0) throw error;
            await this.sessions.delete(session.id);
            this.logger.warn(`Skipping tracking-only meter ${meter.meterId}: ${this.reason(error)}`);
            continue;
          }
        }
        // Increment-only starts have no ready reply to invalidate older pending charges.
        // For requested starts this is an idempotent safeguard after atomic acceptance.
        await this.sessions.update(
          { meterId: meter.meterId, status: ResourceMeteringSessionStatus.Pending },
          {
            status: ResourceMeteringSessionStatus.Failed,
            failureReason: 'The meter was re-initialized for a later session',
          },
        );
      }
    } catch (error) {
      await this.sessions.delete({ usageId: input.usageId });
      if (input.supersedes !== undefined && initializedMeters.size)
        await this.sessions.update(
          { usageId: input.supersedes, meterId: In([...initializedMeters]) },
          {
            compromisedReason: 'The meter was re-initialized by a takeover that did not complete',
          },
        );
      throw new BadRequestException(`METER_INITIALIZATION_FAILED: ${this.reason(error)}`);
    }
  }
}
