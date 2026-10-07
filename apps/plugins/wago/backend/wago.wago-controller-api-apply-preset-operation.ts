import { Body } from '@nestjs/common';
import { Param } from '@nestjs/common';
import { ParseIntPipe } from '@nestjs/common';
import { Post } from '@nestjs/common';
import { Req } from '@nestjs/common';
import type { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { wagoAuditPrincipal } from './wago-audit';
import { BadRequestException } from '@nestjs/common';
import type { WagoPresetApplication } from './configuration';
import type { WagoConfigurationSnapshot } from './configuration';
import { WagoControllerApiPreviewPresetOperation } from './wago.wago-controller-api-preview-preset-operation';


export abstract class WagoControllerApiApplyPresetOperation extends WagoControllerApiPreviewPresetOperation {
  @Post('controllers/:id/configuration/presets/apply') applyPreset(
    @Param('id', ParseIntPipe) id: number,
    @Body()
    body: {
      application?: WagoPresetApplication;
      selectedPaths?: string[];
      previewedDraftHash?: string;
      snapshot?: WagoConfigurationSnapshot;
    },
    @Req() request?: AuthenticatedRequest,
  ) {
    if (!body?.application) throw new BadRequestException('application is required');
    return this.wago.applyPreset(
      id,
      body.application,
      body.selectedPaths ?? [],
      body.previewedDraftHash ?? '',
      body.snapshot,
      wagoAuditPrincipal(request as AuthenticatedRequest),
    );
  }
}
