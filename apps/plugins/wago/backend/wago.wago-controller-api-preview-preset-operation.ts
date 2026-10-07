import { BadRequestException } from '@nestjs/common';
import { Body } from '@nestjs/common';
import { Param } from '@nestjs/common';
import { ParseIntPipe } from '@nestjs/common';
import { Post } from '@nestjs/common';
import type { WagoPresetApplication } from './configuration';
import type { WagoConfigurationSnapshot } from './configuration';
import { WagoControllerApiPresetsOperation } from './wago.wago-controller-api-presets-operation';


export abstract class WagoControllerApiPreviewPresetOperation extends WagoControllerApiPresetsOperation {
  @Post('controllers/:id/configuration/presets/preview') previewPreset(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { application?: WagoPresetApplication; snapshot?: WagoConfigurationSnapshot },
  ) {
    if (!body?.application) throw new BadRequestException('application is required');
    return this.wago.previewPreset(id, body.application, body.snapshot);
  }
}
