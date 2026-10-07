import { BadRequestException } from '@nestjs/common';
import type { WagoPresetApplication } from './configuration';
import type { WagoConfigurationSnapshot } from './configuration';
import { previewConfigurationPreset } from './configuration-editor';
import { WagoServicePresetsOperation } from './wago.wago-service-presets-operation';


export abstract class WagoServicePreviewPresetOperation extends WagoServicePresetsOperation {
  async previewPreset(controllerId: number, application: WagoPresetApplication, snapshot?: WagoConfigurationSnapshot) {
    const draft = await this.getDraft(controllerId);
    const source =
      snapshot ?? (draft ? JSON.parse(draft.snapshot) : { version: 1, physicalPoints: [], logicalChannels: [] });
    try {
      return previewConfigurationPreset(source, application);
    } catch (error) {
      throw new BadRequestException(error instanceof Error ? error.message : 'invalid preset');
    }
  }
}
