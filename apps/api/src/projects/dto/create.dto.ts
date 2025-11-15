import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';
import { FileUpload } from '../../common/types/file-upload.types';

export class CreateProjectDto {
  @ApiProperty({
    description: 'The name of the project',
    example: 'Project 1',
  })
  @IsString()
  name: string;

  @ApiProperty({
    description: 'The description of the project',
    example: 'This is a project',
    required: false,
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    description: 'Project logo image file',
    required: false,
    type: 'string',
    format: 'binary',
  })
  logo?: FileUpload;
}
