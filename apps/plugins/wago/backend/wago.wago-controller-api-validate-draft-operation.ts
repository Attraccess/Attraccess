import { Body } from '@nestjs/common';
import { Param } from '@nestjs/common';
import { ParseIntPipe } from '@nestjs/common';
import { Post } from '@nestjs/common';
import { WagoControllerApiSaveDraftOperation } from './wago.wago-controller-api-save-draft-operation';


export abstract class WagoControllerApiValidateDraftOperation extends WagoControllerApiSaveDraftOperation {
  @Post('controllers/:id/configuration/validate') validateDraft(
    @Param('id', ParseIntPipe) id: number,
    @Body() body?: { snapshot?: unknown },
  ) {
    return this.wago.validateDraft(id, body?.snapshot);
  }
}
