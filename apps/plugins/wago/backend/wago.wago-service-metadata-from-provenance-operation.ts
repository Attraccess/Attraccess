import { editorMetadata } from './configuration-editor';
import type { ConfigurationEditorMetadata } from './configuration-editor';
import { WagoServiceDraftIdentityOperation } from './wago.wago-service-draft-identity-operation';


export abstract class WagoServiceMetadataFromProvenanceOperation extends WagoServiceDraftIdentityOperation {
  protected metadataFromProvenance(provenance: string | null | undefined): ConfigurationEditorMetadata {
    if (!provenance) return { names: {}, presets: [] };
    try {
      return editorMetadata(JSON.parse(provenance).editor);
    } catch {
      return { names: {}, presets: [] };
    }
  }
}
