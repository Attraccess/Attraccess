import { WagoConfigurationRevision } from './wago-configuration-revision.entity';
import { WagoConfigurationDraft } from './wago-configuration-draft.entity';
import { WagoCommandHandlerState } from './wago-command-handler.wago-command-handler-state';


export abstract class WagoCommandHandlerChannelNamesOperation extends WagoCommandHandlerState {
  protected async channelNames(
    controllerId: number | undefined,
    revision: WagoConfigurationRevision | null,
    appliedOnly = false,
  ): Promise<Record<string, unknown>> {
    let names: Record<string, unknown> = {};
    if (controllerId) {
      const draft = appliedOnly
        ? null
        : await this.dependencies.context.getRepository(WagoConfigurationDraft).findOneBy({ controllerId });
      try {
        const storedNames = JSON.parse(revision?.presetProvenance ?? draft?.presetProvenance ?? 'null')?.editor?.names;
        if (storedNames && typeof storedNames === 'object' && !Array.isArray(storedNames)) names = storedNames;
      } catch {
        /* Drafts created before the visual editor have no channel labels. */
      }
    }
    return names;
  }
}
