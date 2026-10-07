import { Body } from '@nestjs/common';
import { Param } from '@nestjs/common';
import { ParseIntPipe } from '@nestjs/common';
import { Post } from '@nestjs/common';
import { Req } from '@nestjs/common';
import type { AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { wagoAuditPrincipal } from './wago-audit';
import { WagoControllerApiRollbackOperation } from './wago.wago-controller-api-rollback-operation';


export abstract class WagoControllerApiAcknowledgeRejectionOperation extends WagoControllerApiRollbackOperation {
  @Post('controllers/:id/configuration/revisions/:revision/acknowledge-rejection') acknowledgeRejection(
    @Param('id', ParseIntPipe) id: number,
    @Param('revision', ParseIntPipe) revision: number,
    @Req() request: AuthenticatedRequest,
    @Body() body?: { contentHash?: string; reportedAt?: string },
  ) {
    return this.wago.acknowledgeRejection(id, revision, body ?? {}, wagoAuditPrincipal(request));
  }
}
