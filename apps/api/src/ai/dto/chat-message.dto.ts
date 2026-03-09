import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsArray } from 'class-validator';

export class ChatMessageDto {
  @ApiPropertyOptional({ description: 'Conversation ID for continuing a conversation' })
  @IsOptional()
  @IsString()
  conversationId?: string;

  @ApiProperty({ description: 'The user message to send to the AI' })
  @IsString()
  message!: string;

  @ApiPropertyOptional({ description: 'IDs of approved tool calls to execute' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  approvedActions?: string[];
}
