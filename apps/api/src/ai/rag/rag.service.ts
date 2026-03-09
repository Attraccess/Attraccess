import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DocEmbedding } from '@attraccess/database-entities';
import { AppConfigType } from '../../config/app.config';
import { OllamaService } from '../ollama.service';
import { chunkMarkdown, DocChunk } from './chunker';
import * as fs from 'fs';
import * as path from 'path';

interface SearchResult {
  source: string;
  content: string;
  score: number;
}

@Injectable()
export class RagService implements OnModuleInit {
  private readonly logger = new Logger(RagService.name);
  private indexed = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly ollamaService: OllamaService,
    @InjectRepository(DocEmbedding)
    private readonly embeddingRepo: Repository<DocEmbedding>,
  ) {}

  get isIndexed(): boolean {
    return this.indexed;
  }

  async onModuleInit() {
    this.indexDocs().catch((err) => this.logger.error('Failed to index docs', err));
  }

  private async indexDocs() {
    const appConfig = this.configService.get<AppConfigType>('app');
    const docsPath = appConfig?.STATIC_DOCS_FILE_PATH;
    if (!docsPath) {
      this.logger.warn('STATIC_DOCS_FILE_PATH not configured, skipping RAG indexing');
      return;
    }

    const resolvedPath = path.resolve(docsPath);
    if (!fs.existsSync(resolvedPath)) {
      this.logger.warn(`Docs path ${resolvedPath} does not exist, skipping RAG indexing`);
      return;
    }

    const healthy = await this.ollamaService.healthCheck();
    if (!healthy) {
      this.logger.warn('Ollama not reachable, skipping RAG indexing');
      return;
    }

    const mdFiles = this.findMarkdownFiles(resolvedPath);
    this.logger.log(`Found ${mdFiles.length} markdown files to index`);

    for (const filePath of mdFiles) {
      await this.indexFile(filePath, resolvedPath);
    }

    this.indexed = true;
    this.logger.log('RAG indexing complete');
  }

  private findMarkdownFiles(dir: string): string[] {
    const results: string[] = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...this.findMarkdownFiles(fullPath));
      } else if (entry.name.endsWith('.md')) {
        results.push(fullPath);
      }
    }
    return results;
  }

  private async indexFile(filePath: string, basePath: string) {
    const relativePath = path.relative(basePath, filePath);
    const stat = fs.statSync(filePath);

    const existing = await this.embeddingRepo.findOne({
      where: { source: relativePath, chunkIndex: 0 },
    });

    if (existing && existing.updatedAt >= stat.mtime) {
      return;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const chunks = chunkMarkdown(relativePath, content);

    if (chunks.length === 0) return;

    await this.embeddingRepo.delete({ source: relativePath });

    const batchSize = 8;
    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize);
      const texts = batch.map((c) => c.content);
      const embeddings = await this.ollamaService.embedBatch(texts);

      const entities = batch.map((chunk: DocChunk, idx: number) => {
        const entity = new DocEmbedding();
        entity.source = chunk.source;
        entity.chunkIndex = chunk.chunkIndex;
        entity.content = chunk.content;
        entity.embedding = embeddings[idx] ?? [];
        return entity;
      });

      await this.embeddingRepo.save(entities);
    }

    this.logger.log(`Indexed ${chunks.length} chunks from ${relativePath}`);
  }

  async search(query: string, topK: number = 5): Promise<SearchResult[]> {
    const queryEmbedding = await this.ollamaService.embed(query);
    const allEmbeddings = await this.embeddingRepo.find();

    const scored = allEmbeddings.map((doc) => ({
      source: doc.source,
      content: doc.content,
      score: this.cosineSimilarity(queryEmbedding, doc.embedding),
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length || a.length === 0) return 0;
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }
}
