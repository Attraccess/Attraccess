import { registerAs } from '@nestjs/config';
import { z } from 'zod';

export const AiEnvSchema = z.object({
  AI_ENABLED: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  OLLAMA_BASE_URL: z.string().default('http://ollama:11434'),
  OLLAMA_CHAT_MODEL: z.string().default('qwen3.5:4b'),
  OLLAMA_EMBED_MODEL: z.string().default('nomic-embed-text'),
  AI_MAX_CONTEXT_CHUNKS: z.coerce.number().positive().default(5),
});

export interface AiConfigType {
  enabled: boolean;
  ollamaBaseUrl: string;
  chatModel: string;
  embedModel: string;
  maxContextChunks: number;
}

const aiConfigFactory = (): AiConfigType => {
  const validatedEnv = AiEnvSchema.parse(process.env);

  return {
    enabled: validatedEnv.AI_ENABLED,
    ollamaBaseUrl: validatedEnv.OLLAMA_BASE_URL,
    chatModel: validatedEnv.OLLAMA_CHAT_MODEL,
    embedModel: validatedEnv.OLLAMA_EMBED_MODEL,
    maxContextChunks: validatedEnv.AI_MAX_CONTEXT_CHUNKS,
  };
};

export default registerAs('ai', aiConfigFactory);
