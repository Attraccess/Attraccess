import { ApiProperty } from '@nestjs/swagger';
import { MessageReferenceType } from '@attraccess/database-entities';

export class SuggestedMessageDto {
  @ApiProperty({
    description: 'Suggested prefilled message content referencing the resource',
    example: 'Hi, are you currently using the Laser Cutter?',
  })
  content!: string;

  @ApiProperty({
    description: 'Type of context this suggested message references',
    enum: MessageReferenceType,
    enumName: 'MessageReferenceType',
  })
  referenceType!: MessageReferenceType;

  @ApiProperty({
    description: 'ID of the referenced entity, scoped by referenceType',
    example: 1,
  })
  referenceId!: number;
}

export class ContactResponseDto {
  @ApiProperty({
    description: 'The ID of the existing or newly created 1:1 conversation',
    example: 1,
  })
  conversationId!: number;

  @ApiProperty({
    description: 'Optional suggested prefilled message referencing the resource',
    type: SuggestedMessageDto,
    required: false,
    nullable: true,
  })
  suggestedMessage?: SuggestedMessageDto | null;
}
