import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocEmbedding } from '@attraccess/database-entities';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { OllamaService } from './ollama.service';
import { RagService } from './rag/rag.service';
import { ToolRegistry } from './tools/tool-registry';
import { ToolExecutor } from './tools/tool-executor';

@Module({
  imports: [TypeOrmModule.forFeature([DocEmbedding])],
  controllers: [AiController],
  providers: [AiService, OllamaService, RagService, ToolRegistry, ToolExecutor],
})
export class AiModule {}
