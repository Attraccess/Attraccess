import {
  Controller,
  Get,
  Header,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  StreamableFile,
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
import { Auth, type AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import type { FileUpload } from '../../../common/types/file-upload.types';
import { FormImageDto, FormImageUploadQueryDto } from './form-image.dto';
import { FORM_IMAGE_BODY, FormImageUploadInterceptor } from './form-image-upload.interceptor';
import { FormImagesService } from './form-images.service';
import { FormImageViewerGuard } from './form-image-viewer.guard';

/** Images of image form fields for signed-in users: upload before the form is submitted, view afterwards. */
@ApiTags('Forms')
@Controller()
export class FormImagesController {
  constructor(private readonly images: FormImagesService) {}

  @Post('resources/:resourceId/forms/:formId/fields/:fieldId/images')
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
  @Header('Cache-Control', 'private, max-age=3600')
  @Header('X-Content-Type-Options', 'nosniff')
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
  async get(
    @Param('imageId', ParseUUIDPipe) imageId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<StreamableFile> {
    const { stream, image } = await this.images.openForViewer(imageId, {
      id: req.user.id,
      mayViewAll: req.user.effectivePermissions?.has('resources.update') === true,
    });
    return new StreamableFile(stream, { type: image.mimeType, length: image.size });
  }
}
