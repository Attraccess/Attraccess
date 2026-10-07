import { Param } from '@nestjs/common';
import { ParseIntPipe } from '@nestjs/common';
import { Get } from '@nestjs/common';
import { WagoControllerApiAcknowledgeRejectionOperation } from './wago.wago-controller-api-acknowledge-rejection-operation';


export abstract class WagoControllerApiPreviewRevisionOperation extends WagoControllerApiAcknowledgeRejectionOperation {
  @Get('controllers/:id/configuration/revisions/:revision/preview') previewRevision(
    @Param('id', ParseIntPipe) id: number,
    @Param('revision', ParseIntPipe) revision: number,
  ) {
    return this.wago.previewRevision(id, revision);
  }
}
