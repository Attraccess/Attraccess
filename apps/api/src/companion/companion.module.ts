import { Module } from '@nestjs/common';
import { CompanionPersistenceModule } from '../database/adapters/companion/companion-persistence.module';
import { CompanionService } from './companion.service';
import { CompanionGatewayService } from './companion-gateway.service';
import { CompanionAuthHandler } from './companion-auth.handler';
import { CompanionGateway } from './companion.gateway';
import { CompanionController, CompanionDownloadController } from './companion.controller';

@Module({
  imports: [CompanionPersistenceModule],
  providers: [CompanionService, CompanionGatewayService, CompanionAuthHandler, CompanionGateway],
  controllers: [CompanionController, CompanionDownloadController],
  exports: [CompanionService, CompanionGateway, CompanionGatewayService],
})
export class CompanionModule {}
