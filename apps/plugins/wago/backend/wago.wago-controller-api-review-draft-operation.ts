import { Param } from '@nestjs/common';
import { ParseIntPipe } from '@nestjs/common';
import { Post } from '@nestjs/common';
import { WagoControllerApiValidateDraftOperation } from './wago.wago-controller-api-validate-draft-operation';


export abstract class WagoControllerApiReviewDraftOperation extends WagoControllerApiValidateDraftOperation {
  @Post('controllers/:id/configuration/review') reviewDraft(@Param('id', ParseIntPipe) id: number) {
    return this.wago.reviewDraft(id);
  }
}
