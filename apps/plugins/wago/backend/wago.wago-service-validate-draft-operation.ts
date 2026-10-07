import { NotFoundException } from '@nestjs/common';
import type { ConfigurationValidationError } from './configuration';
import { validateEditorSnapshot } from './configuration-editor';
import { WagoServicePreviewPresetOperation } from './wago.wago-service-preview-preset-operation';


export abstract class WagoServiceValidateDraftOperation extends WagoServicePreviewPresetOperation {
  async validateDraft(
    controllerId: number,
    snapshot?: unknown,
  ): Promise<{ valid: boolean; errors: ConfigurationValidationError[] }> {
    const draft = await this.getDraft(controllerId);
    if (!draft && snapshot === undefined)
      throw new NotFoundException(`WAGO controller ${controllerId} has no configuration draft`);
    const errors = validateEditorSnapshot(snapshot === undefined && draft ? JSON.parse(draft.snapshot) : snapshot);
    return { valid: errors.length === 0, errors };
  }
}
