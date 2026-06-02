import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Conversation, ConversationParticipant, Message, User } from '@attraccess/database-entities';
import { MessagingService } from './messaging.service';
import { MessagingLiveService } from './messaging-live.service';
import { MessagingController } from './messaging.controller';
import { ResourceUsageModule } from '../resources/usage/resourceUsage.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Conversation, ConversationParticipant, Message, User]),
    ResourceUsageModule,
  ],
  controllers: [MessagingController],
  providers: [MessagingService, MessagingLiveService],
  exports: [MessagingService],
})
export class MessagingModule {}
