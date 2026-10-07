import { Param } from '@nestjs/common';
import { ParseIntPipe } from '@nestjs/common';
import { Get } from '@nestjs/common';
import { Query } from '@nestjs/common';
import { WagoControllerApiReviewDraftOperation } from './wago.wago-controller-api-review-draft-operation';


export abstract class WagoControllerApiRevisionsOperation extends WagoControllerApiReviewDraftOperation {
  @Get('controllers/:id/configuration/revisions') revisions(
    @Param('id', ParseIntPipe) id: number,
    @Query('offset') offset?: string,
    @Query('limit') limit?: string,
  ) {
    return this.wago.revisionsFor(id, Number(offset), Number(limit));
  }
}
