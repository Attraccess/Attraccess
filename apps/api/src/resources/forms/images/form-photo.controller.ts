import {
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiOperation, ApiParam, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { FileUpload } from '../../../common/types/file-upload.types';
import { FormImageDto, FormPhotoPageDto } from './form-image.dto';
import { FORM_IMAGE_BODY, FormImageUploadInterceptor } from './form-image-upload.interceptor';
import { FormImageHandoffService } from './form-image-handoff.service';
import { FormPhotoRateLimit, FormPhotoRateLimitGuard } from './form-photo-rate-limit.guard';

/**
 * The phone page of an image field on an Attractap reader. No sign-in: the link token authorises, and only for the
 * images uploaded under that token. Every answer for an unknown, expired, ended or used-up token is 410.
 */
@ApiTags('Forms')
@Controller('form-photo/:token')
@UseGuards(FormPhotoRateLimitGuard)
export class FormPhotoController {
  constructor(private readonly handoffs: FormImageHandoffService) {}

  @Get()
  @FormPhotoRateLimit('read')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Get what the phone page of a reader handoff shows', operationId: 'formPhotoGetPage' })
  @ApiParam({ name: 'token', type: String })
  @ApiResponse({ status: 200, type: FormPhotoPageDto })
  @ApiResponse({ status: 410, description: 'The link expired, ended or was used up' })
  page(@Param('token') token: string): Promise<FormPhotoPageDto> {
    return this.handoffs.page(token);
  }

  @Post('images')
  @FormPhotoRateLimit('write')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({ summary: 'Add an image through a reader handoff link', operationId: 'formPhotoUpload' })
  @ApiConsumes('multipart/form-data')
  @ApiBody(FORM_IMAGE_BODY)
  @ApiParam({ name: 'token', type: String })
  @ApiResponse({ status: 201, type: FormImageDto })
  @ApiResponse({ status: 410, description: 'The link expired, ended or was used up' })
  @UseInterceptors(FormImageUploadInterceptor())
  upload(@Param('token') token: string, @UploadedFile() image?: FileUpload): Promise<FormImageDto> {
    return this.handoffs.upload(token, image);
  }

  @Get('images/:imageId')
  @FormPhotoRateLimit('read')
  @Header('Cache-Control', 'private, no-store')
  @Header('X-Content-Type-Options', 'nosniff')
  @ApiOperation({ summary: 'Get an image added through a reader handoff link', operationId: 'formPhotoGetImage' })
  @ApiParam({ name: 'token', type: String })
  @ApiParam({ name: 'imageId', type: String })
  @ApiProduces('image/jpeg')
  @ApiResponse({
    status: 200,
    description: 'The JPEG image',
    content: { 'image/jpeg': { schema: { type: 'string', format: 'binary' } } },
  })
  async image(
    @Param('token') token: string,
    @Param('imageId', ParseUUIDPipe) imageId: string,
  ): Promise<StreamableFile> {
    const { stream } = await this.handoffs.openImage(token, imageId);
    return new StreamableFile(stream, { type: 'image/jpeg' });
  }

  @Delete('images/:imageId')
  @HttpCode(204)
  @FormPhotoRateLimit('write')
  @ApiOperation({ summary: 'Remove an image added through a reader handoff link', operationId: 'formPhotoRemoveImage' })
  @ApiParam({ name: 'token', type: String })
  @ApiParam({ name: 'imageId', type: String })
  @ApiResponse({ status: 204, description: 'Image removed' })
  async remove(@Param('token') token: string, @Param('imageId', ParseUUIDPipe) imageId: string): Promise<void> {
    await this.handoffs.removeImage(token, imageId);
  }
}
