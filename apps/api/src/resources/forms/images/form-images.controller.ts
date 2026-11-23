import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { Auth, type AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import type { FileUpload } from '../../../common/types/file-upload.types';
import { FormImageDto, FormImageUploadQueryDto } from './form-image.dto';
import { FORM_IMAGE_BODY, FormImageUploadInterceptor } from './form-image-upload.interceptor';
import { FormImagesService } from './form-images.service';
import { FormImageViewerGuard } from './form-image-viewer.guard';
import { FormPhotoRateLimit, FormPhotoRateLimitGuard } from './form-photo-rate-limit.guard';

/** Whether an `If-None-Match` header names this entity tag (weak or strong) or is `*`. */
function matchesEntityTag(header: string | undefined, etag: string): boolean {
  if (!header) return false;
  return header.split(',').some((candidate) => {
    const tag = candidate.trim();
    return tag === '*' || tag.replace(/^W\//, '') === etag;
  });
}

/** Images of image form fields for signed-in users: upload before the form is submitted, view afterwards. */
@ApiTags('Forms')
@Controller()
export class FormImagesController {
  constructor(private readonly images: FormImagesService) {}

  @Post('resources/:resourceId/forms/:formId/fields/:fieldId/images')
  // Above @Auth(): guards of a lower decorator run first, so the limit counts the signed-in user.
  @UseGuards(FormPhotoRateLimitGuard)
  @FormPhotoRateLimit('upload')
  @Auth()
  @ApiOperation({
    summary: 'Upload an image for an image field',
    description:
      'JPEG, PNG or WebP. The image is turned upright, stripped of all metadata, scaled down and stored as JPEG. ' +
      'The answer of the field lists the returned ids.',
    operationId: 'formImagesUpload',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody(FORM_IMAGE_BODY)
  @ApiParam({ name: 'resourceId', type: Number })
  @ApiParam({ name: 'formId', type: Number })
  @ApiParam({ name: 'fieldId', type: Number })
  @ApiResponse({ status: 201, type: FormImageDto })
  @ApiResponse({ status: 429, description: 'Too many uploads, or too many photos waiting for a submission' })
  @UseInterceptors(FormImageUploadInterceptor())
  async upload(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Param('formId', ParseIntPipe) formId: number,
    @Param('fieldId', ParseIntPipe) fieldId: number,
    @Query() query: FormImageUploadQueryDto,
    @Req() req: AuthenticatedRequest,
    @UploadedFile() image?: FileUpload,
  ): Promise<FormImageDto> {
    return this.images.upload(image, { resourceId, action: query.action, formId, fieldId }, req.user.id);
  }

  @Get('forms/images/:imageId')
  @UseGuards(FormImageViewerGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get a form image',
    description:
      'For the user the submission belongs to, users who may update resources, and the uploader before the image is ' +
      'attached. Everyone else, a request without a sign-in included, gets 404.',
    operationId: 'formImagesGet',
  })
  @ApiParam({ name: 'imageId', type: String })
  @ApiProduces('image/jpeg')
  @ApiResponse({
    status: 200,
    description: 'The JPEG image',
    content: { 'image/jpeg': { schema: { type: 'string', format: 'binary' } } },
  })
  @ApiResponse({ status: 304, description: 'The image did not change (If-None-Match)' })
  async get(
    @Param('imageId', ParseUUIDPipe) imageId: string,
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ): Promise<void> {
    const image = await this.images.findForViewer(imageId, {
      id: req.user.id,
      mayViewAll: req.user.effectivePermissions?.has('resources.update') === true,
    });
    // Only after the access check: a browser shared by several users must ask every time (no-cache), and an image
    // never changes under its id, so the id is its entity tag and an unchanged image costs a 304.
    const etag = `"${image.id}"`;
    res.set({ 'Cache-Control': 'private, no-cache', ETag: etag, 'X-Content-Type-Options': 'nosniff' });
    if (matchesEntityTag(req.headers['if-none-match'], etag)) {
      res.status(304).end();
      return;
    }
    // The response is written here (not returned): Nest would overwrite the 304 above with the route's 200.
    const stream = await this.images.open(image);
    res.set({ 'Content-Type': image.mimeType, 'Content-Length': String(image.size) });
    stream.once('error', () => res.destroy());
    res.once('close', () => stream.destroy());
    stream.pipe(res);
  }
}
