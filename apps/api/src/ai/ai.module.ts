import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AiConversation, AiConversationMessage, DocEmbedding } from '@attraccess/database-entities';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { OllamaService } from './ollama.service';
import { RagService } from './rag/rag.service';
import { ToolRegistry } from './tools/tool-registry';
import { SettingsModule } from '../settings/settings.module';
import { ResourcesModule } from '../resources/resources.module';

@Module({
  imports: [TypeOrmModule.forFeature([DocEmbedding, AiConversation, AiConversationMessage]), SettingsModule, ResourcesModule],
  controllers: [AiController],
  providers: [AiService, OllamaService, RagService, ToolRegistry],
  exports: [ToolRegistry],
})
export class AiModule {}
