import { Body } from '@nestjs/common';
import { Param } from '@nestjs/common';
import { ParseIntPipe } from '@nestjs/common';
import { Post } from '@nestjs/common';
import { Req } from '@nestjs/common';
import type { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { wagoAuditPrincipal } from './wago-audit';
import type { ConfigurationEditorMetadata } from './configuration-editor';
import { WagoControllerApiApplyPresetOperation } from './wago.wago-controller-api-apply-preset-operation';


export abstract class WagoControllerApiSaveDraftOperation extends WagoControllerApiApplyPresetOperation {
  @Post('controllers/:id/configuration/draft') saveDraft(
    @Param('id', ParseIntPipe) id: number,
    @Body()
    body: {
      snapshot?: unknown;
      metadata?: ConfigurationEditorMetadata;
      expectedDraft?: { snapshot: string; presetProvenance: string | null; updatedAt: string } | null;
    },
    @Req() request: AuthenticatedRequest,
  ) {
    return this.wago.saveDraft(id, body?.snapshot, body?.metadata, wagoAuditPrincipal(request), body?.expectedDraft);
  }
}
