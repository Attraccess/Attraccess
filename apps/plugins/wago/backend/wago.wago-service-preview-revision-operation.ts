import { NotFoundException } from '@nestjs/common';
import { configurationDiff } from './configuration';
import { configurationFlowImpacts } from './configuration-flow-references';
import { WagoConfigurationRevision } from './wago-configuration-revision.entity';
import { WagoServiceAcknowledgeRejectionOperation } from './wago.wago-service-acknowledge-rejection-operation';


export abstract class WagoServicePreviewRevisionOperation extends WagoServiceAcknowledgeRejectionOperation {
  async previewRevision(
    controllerId: number,
    revision: number,
  ): Promise<{
    impacts: Awaited<ReturnType<typeof configurationFlowImpacts>>;
    revision: WagoConfigurationRevision;
    draftHash: string;
    current: WagoConfigurationRevision | null;
    diff: ReturnType<typeof configurationDiff>;
    metadataDiff: ReturnType<typeof configurationDiff>;
  }> {
    return this.withConfigurationLock(controllerId, async () => {
      await this.claimedController(controllerId);
      const selected = await this.revisions.findOneBy({ controllerId, revision });
      if (!selected) throw new NotFoundException(`WAGO configuration revision ${revision} not found`);
      const [current] = await this.revisions.find({ where: { controllerId }, order: { revision: 'DESC' }, take: 1 });
      const draft = await this.drafts.findOneBy({ controllerId });
      const impacts = await configurationFlowImpacts(
        this.context,
        controllerId,
        current ? JSON.parse(current.snapshot) : null,
        JSON.parse(selected.snapshot),
      );
      return {
        draftHash: this.rollbackIdentity(draft, current ?? null, selected, impacts),
        impacts,
        revision: selected,
        current: current ?? null,
        diff: configurationDiff(current ? JSON.parse(current.snapshot) : null, JSON.parse(selected.snapshot)),
        metadataDiff: configurationDiff(
          this.metadataFromProvenance(current?.presetProvenance),
          this.metadataFromProvenance(selected.presetProvenance),
        ),
      };
    });
  }
}
