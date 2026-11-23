import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { ResourceFormAction } from '@attraccess/application-models';

export class FormImageUploadQueryDto {
  @ApiProperty({ description: 'Usage action the form is filled in for', enum: ResourceFormAction })
  @IsEnum(ResourceFormAction)
  action!: ResourceFormAction;
}

/** An uploaded, processed image. Fetch it with `GET /forms/images/{id}`. */
export class FormImageDto {
  @ApiProperty({ description: 'The image id; the answer of an image field lists these ids', format: 'uuid' })
  id!: string;

  @ApiProperty({ description: 'Width in pixels after processing', example: 1920 })
  width!: number;

  @ApiProperty({ description: 'Height in pixels after processing', example: 1080 })
  height!: number;
}

/** What the phone page of a reader handoff shows. */
export class FormPhotoPageDto {
  @ApiProperty({ description: 'The resource the form is filled in for' })
  resourceName!: string;

  @ApiProperty({ description: 'The form name' })
  formName!: string;

  @ApiProperty({ description: 'The name of the image field' })
  fieldName!: string;

  @ApiProperty({ description: 'The description of the image field', nullable: true, type: String })
  fieldDescription!: string | null;

  @ApiProperty({ description: 'How many images the field accepts' })
  maxImages!: number;

  @ApiProperty({ description: 'How many more images this link accepts' })
  uploadsRemaining!: number;

  @ApiProperty({ description: 'When the link expires' })
  expiresAt!: Date;

  @ApiProperty({ description: 'The images added so far', type: () => FormImageDto, isArray: true })
  images!: FormImageDto[];
}
