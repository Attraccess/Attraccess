import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AiStatusDto {
  @ApiProperty({ description: 'Whether AI features are enabled' })
  enabled: boolean;

  @ApiProperty({ description: 'Whether Ollama is reachable' })
  ollamaConnected: boolean;

  @ApiProperty({ description: 'Whether all required models are downloaded and ready' })
  modelsReady: boolean;

  @ApiProperty({ description: 'Whether models are currently being pulled' })
  modelsPulling: boolean;

  @ApiPropertyOptional({
    description: 'Progress of model pulls (model name to status string)',
    type: 'object',
    additionalProperties: { type: 'string' },
  })
  pullProgress?: Record<string, string>;

  @ApiProperty({ description: 'Whether RAG document embeddings are indexed' })
  embeddingIndexed: boolean;
}
