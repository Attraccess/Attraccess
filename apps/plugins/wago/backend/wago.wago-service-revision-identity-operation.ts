import { WagoConfigurationRevision } from './wago-configuration-revision.entity';
import { WagoServicePreviewRevisionOperation } from './wago.wago-service-preview-revision-operation';


export abstract class WagoServiceRevisionIdentityOperation extends WagoServicePreviewRevisionOperation {
  protected revisionIdentity(revision: WagoConfigurationRevision | null): unknown {
    return revision
      ? { revision: revision.revision, contentHash: revision.contentHash, metadata: revision.presetProvenance ?? null }
      : null;
  }
}
