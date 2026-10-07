import { Body } from '@nestjs/common';
import { Param } from '@nestjs/common';
import { ParseIntPipe } from '@nestjs/common';
import { Post } from '@nestjs/common';
import { Req } from '@nestjs/common';
import type { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { wagoAuditPrincipal } from './wago-audit';
import { WagoControllerApiPublishDraftOperation } from './wago.wago-controller-api-publish-draft-operation';


export abstract class WagoControllerApiRollbackOperation extends WagoControllerApiPublishDraftOperation {
  @Post('controllers/:id/configuration/rollback/:revision') rollback(
    @Param('id', ParseIntPipe) id: number,
    @Param('revision', ParseIntPipe) revision: number,
    @Req() request: AuthenticatedRequest,
    @Body() body?: { force?: boolean; sourceHash?: string; currentHash?: string | null; draftHash?: string },
  ) {
    return this.wago.rollback(
      id,
      revision,
      body?.force === true,
      body?.sourceHash,
      body?.currentHash,
      body?.draftHash,
      wagoAuditPrincipal(request),
    );
  }
}
