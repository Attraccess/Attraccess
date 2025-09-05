import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, MinLength, IsEnum, IsUrl, ValidateIf, IsBoolean } from 'class-validator';
import { FileUpload } from '../../common/types/file-upload.types';
import { DocumentationType, ResourceType } from '@attraccess/database-entities';
import { ToBoolean } from '../../common/request-transformers';

export class CreateResourceDto {
  @ApiProperty({
    description: 'The name of the resource',
    example: '3D Printer',
  })
  @IsString()
  @MinLength(1)
  name: string;

  @ApiProperty({
    description: 'The type of the resource',
    example: ResourceType.Machine,
    enum: ResourceType,
  })
  @IsEnum(ResourceType)
  type: ResourceType;

  @ApiProperty({
    description: '(only for doors) wheter the door needs seperate actions for unlocking and unlatching',
    example: false,
    default: false,
    required: false,
  })
  @IsBoolean()
  @IsOptional()
  @ToBoolean()
  separateUnlockAndUnlatch?: boolean;

  @ApiProperty({
    description: 'A detailed description of the resource',
    example: 'Prusa i3 MK3S+ 3D printer with 0.4mm nozzle',
    required: false,
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    description: 'Resource image file',
    required: false,
    type: 'string',
    format: 'binary',
  })
  image?: FileUpload;

  @ApiProperty({
    description: 'The type of documentation (markdown or url)',
    enum: DocumentationType,
    required: false,
    example: DocumentationType.MARKDOWN,
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

  @ApiProperty({
    description: 'Whether this resource allows overtaking by the next user without the prior user ending their session',
    required: false,
    example: false,
    default: false,
    type: Boolean,
  })
  @IsBoolean()
  @IsOptional()
  @ToBoolean()
  allowTakeOver?: boolean;
}
