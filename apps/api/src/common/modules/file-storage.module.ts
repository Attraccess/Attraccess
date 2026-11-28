import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { FileStorageService } from '../services/file-storage.service';

@Module({
  imports: [ConfigModule],
  providers: [FileStorageService],
  exports: [FileStorageService],
})
export class FileStorageModule {}
