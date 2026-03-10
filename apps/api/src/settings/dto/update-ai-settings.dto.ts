import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class UpdateAiSettingsDto {
  @IsOptional()
  @IsBoolean()
  @ApiPropertyOptional({
    description: 'Whether AI features are enabled.',
    example: true,
  })
  enabled?: boolean;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @ApiPropertyOptional({
    description: 'Base URL of the Ollama server.',
    example: 'http://localhost:11434',
  })
  ollamaBaseUrl?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @ApiPropertyOptional({
    description: 'Ollama chat model name.',
    example: 'llama3.2',
  })
  chatModel?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @ApiPropertyOptional({
    description: 'Ollama embedding model name.',
    example: 'nomic-embed-text',
  })
  embedModel?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @ApiPropertyOptional({
    description: 'Maximum number of RAG context chunks to include.',
    example: 5,
  })
  maxContextChunks?: number;
}
