import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class UpdateReaderDto {
  @ApiProperty({
    description: 'The name of the reader',
    example: 'Main Entrance Reader',
  })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({
    description: 'The IDs of the resources that the reader has access to',
    type: [Number],
  })
  @IsArray()
  @IsNotEmpty()
  @IsNumber({}, { each: true })
  connectedResourceIds: number[];
}
