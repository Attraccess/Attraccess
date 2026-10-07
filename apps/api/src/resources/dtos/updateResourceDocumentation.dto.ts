import { DocumentationType } from '@attraccess/database-entities';
import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString, IsUrl, ValidateIf } from 'class-validator';
import { ToBoolean } from '../../common/request-transformers';
import { FileUpload } from '../../common/types/file-upload.types';
export class UpdateResourceDtoDocumentation {
  @ApiProperty({
    description: 'New resource image file',
    required: false,
    type: 'string',
    format: 'binary',
  })
  image?: FileUpload;

  @ApiProperty({
    description: 'Whether the resource image should be deleted',
    required: false,
    type: Boolean,
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  @ToBoolean()
  deleteImage?: boolean;

  @ApiProperty({
    description: 'The type of documentation (markdown or url)',
    enum: DocumentationType,
    required: false,
    example: DocumentationType.MARKDOWN,
    enumName: 'DocumentationType',
  })
  @IsEnum(DocumentationType)
  @IsOptional()
  documentationType?: DocumentationType;

  @ApiProperty({
    description: 'Markdown content for resource documentation',
    required: false,
    example: '# Resource Documentation\n\nThis is a markdown documentation for the resource.',
  })
  @IsString()
  @ValidateIf((o) => o.documentationType === DocumentationType.MARKDOWN)
  @IsOptional()
  documentationMarkdown?: string;

  @ApiProperty({
    description: 'URL to external documentation',
    required: false,
    example: 'https://example.com/documentation',
  })
  @IsUrl()
  @ValidateIf((o) => o.documentationType === DocumentationType.URL)
  @IsOptional()
  documentationUrl?: string;
}
