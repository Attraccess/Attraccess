import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EncryptionService } from './encryption.service';
import { TokenHashService } from './token-hash.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [EncryptionService, TokenHashService],
  exports: [EncryptionService, TokenHashService],
})
export class EncryptionModule { }
