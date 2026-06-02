import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, ValidateIf } from 'class-validator';
import { MessageReferenceType } from '@attraccess/database-entities';

export class SendMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  @ApiProperty({
    description: 'The text content of the message',
    example: 'Hello there',
  })
  content!: string;

  @IsOptional()
  @IsEnum(MessageReferenceType)
  @ApiProperty({
    description: 'Optional type of context this message references',
    enum: MessageReferenceType,
    enumName: 'MessageReferenceType',
    required: false,
  })
  referenceType?: MessageReferenceType;

  @ValidateIf((o) => o.referenceType !== undefined)
  @IsInt()
  @ApiProperty({
    description: 'Optional ID of the referenced entity, scoped by referenceType',
    example: 1,
    required: false,
  })
  referenceId?: number;
}
