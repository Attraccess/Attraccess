import { Body } from '@nestjs/common';
import { Param } from '@nestjs/common';
import { ParseIntPipe } from '@nestjs/common';
import { Post } from '@nestjs/common';
import { Req } from '@nestjs/common';
import type { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { wagoAuditPrincipal } from './wago-audit';
import { WagoControllerApiRevisionsOperation } from './wago.wago-controller-api-revisions-operation';


export abstract class WagoControllerApiPublishDraftOperation extends WagoControllerApiRevisionsOperation {
  @Post('controllers/:id/configuration/publish') publishDraft(
    @Param('id', ParseIntPipe) id: number,
    @Req() request: AuthenticatedRequest,
    @Body() body?: { force?: boolean; reviewedHash?: string },
  ) {
    return this.wago.publishDraft(id, body?.force === true, body?.reviewedHash, wagoAuditPrincipal(request));
  }
}
