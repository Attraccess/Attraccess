import { ApiProperty } from '@nestjs/swagger';

export class AiSettingsDto {
  @ApiProperty({ description: 'Whether AI features are enabled.' })
  enabled!: boolean;

  @ApiProperty({
    description: 'Base URL of the Ollama server.',
    example: 'http://localhost:11434',
    nullable: true,
  })
  ollamaBaseUrl!: string | null;

  @ApiProperty({
    description: 'Ollama chat model name.',
    example: 'llama3.2',
    nullable: true,
  })
  chatModel!: string | null;

  @ApiProperty({
    description: 'Ollama embedding model name.',
    example: 'nomic-embed-text',
    nullable: true,
  })
  embedModel!: string | null;

  @ApiProperty({
    description: 'Maximum number of RAG context chunks to include.',
    example: 5,
    nullable: true,
  })
  maxContextChunks!: number | null;
}
