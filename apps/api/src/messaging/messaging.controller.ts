import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  Sse,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Auth, AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { Message, MessageReferenceType } from '@attraccess/database-entities';
import { Observable } from 'rxjs';
import { MessagingService } from './messaging.service';
import { MessagingLiveService } from './messaging-live.service';
import { SseInstrumentation } from '../metrics/instrumentation/sse/sse.helper';
import { ContactResponseDto } from './dtos/contactResponse.dto';
import { SendMessageDto } from './dtos/sendMessage.dto';
import { ListMessagesQueryDto } from './dtos/listMessagesQuery.dto';
import { ListMessagesResponseDto } from './dtos/listMessagesResponse.dto';
import { ConversationListItemDto } from './dtos/conversationListItem.dto';
import { NotificationPreferenceDto } from './dtos/notificationPreference.dto';
import { UpdateNotificationPreferenceDto } from './dtos/updateNotificationPreference.dto';
import { UnreadCountResponseDto } from './dtos/unreadCountResponse.dto';

@ApiTags('Messaging')
@Controller('messaging')
export class MessagingController {
  constructor(
    private readonly messagingService: MessagingService,
    private readonly messagingLiveService: MessagingLiveService,
    private readonly sse: SseInstrumentation,
  ) {}

  @Sse('live')
  @Auth()
  @ApiOperation({ summary: 'Subscribe to live new messages for the authenticated user', operationId: 'messagingLive' })
  streamMessages(@Req() req: AuthenticatedRequest): Observable<{ data: Message }> {
    const subject = this.messagingLiveService.getUserMessageSubject(req.user.id);
    return this.sse.wrap('messaging', subject.asObservable());
  }

  @Post('users/:userId/contact')
  @Auth()
  @ApiOperation({
    summary: 'Get or create a 1:1 conversation with a target user',
    operationId: 'messagingContactUser',
  })
  @ApiResponse({ status: 201, description: 'The existing or newly created conversation', type: ContactResponseDto })
  async contactUser(
    @Param('userId', ParseIntPipe) userId: number,
    @Req() req: AuthenticatedRequest,
  ): Promise<ContactResponseDto> {
    const conversation = await this.messagingService.getOrCreateConversation(req.user.id, userId);
    return { conversationId: conversation.id, suggestedMessage: null };
  }

  @Post('resources/:resourceId/contact')
  @Auth()
  @ApiOperation({
    summary: 'Resolve the active holder of a resource and open a 1:1 conversation with them',
    operationId: 'messagingContactResourceHolder',
  })
  @ApiResponse({ status: 201, description: 'The conversation with the resource holder', type: ContactResponseDto })
  @ApiResponse({ status: 404, description: 'No active session for this resource' })
  async contactResourceHolder(
    @Param('resourceId', ParseIntPipe) resourceId: number,
    @Req() req: AuthenticatedRequest,
  ): Promise<ContactResponseDto> {
    const holder = await this.messagingService.resolveResourceHolder(resourceId);
    if (!holder) {
      throw new NotFoundException(`No active session found for resource with ID ${resourceId}`);
    }

    const conversation = await this.messagingService.getOrCreateConversation(req.user.id, holder.id);

    return {
      conversationId: conversation.id,
      suggestedMessage: {
        content: 'Hi, are you currently using this resource?',
        referenceType: MessageReferenceType.RESOURCE,
        referenceId: resourceId,
      },
    };
  }

  @Get('conversations')
  @Auth()
  @ApiOperation({ summary: 'List the authenticated user inbox conversations', operationId: 'messagingListConversations' })
  @ApiResponse({ status: 200, description: 'The inbox conversations', type: [ConversationListItemDto] })
  async listConversations(@Req() req: AuthenticatedRequest): Promise<ConversationListItemDto[]> {
    return this.messagingService.listConversations(req.user.id);
  }

  @Get('unread-count')
  @Auth()
  @ApiOperation({
    summary: 'Get the total number of unread messages for the authenticated user',
    operationId: 'messagingGetUnreadCount',
  })
  @ApiResponse({ status: 200, description: 'The total unread message count', type: UnreadCountResponseDto })
  async getUnreadCount(@Req() req: AuthenticatedRequest): Promise<UnreadCountResponseDto> {
    return { total: await this.messagingService.getTotalUnreadCount(req.user.id) };
  }

  @Post('conversations/:id/read')
  @Auth()
  @ApiOperation({
    summary: 'Mark a conversation as read for the authenticated user',
    operationId: 'messagingMarkConversationRead',
  })
  @ApiResponse({ status: 201, description: 'The updated total unread message count', type: UnreadCountResponseDto })
  @ApiResponse({ status: 403, description: 'You are not a participant of this conversation' })
  async markConversationRead(
    @Param('id', ParseIntPipe) id: number,
    @Req() req: AuthenticatedRequest,
  ): Promise<UnreadCountResponseDto> {
    return { total: await this.messagingService.markConversationRead(id, req.user.id) };
  }

  @Get('conversations/:id/messages')
  @Auth()
  @ApiOperation({ summary: 'List paginated messages of a conversation', operationId: 'messagingListMessages' })
  @ApiResponse({ status: 200, description: 'The paginated messages', type: ListMessagesResponseDto })
  @ApiResponse({ status: 403, description: 'You are not a participant of this conversation' })
  async listMessages(
    @Param('id', ParseIntPipe) id: number,
    @Query() query: ListMessagesQueryDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<ListMessagesResponseDto> {
    return this.messagingService.listMessages(id, req.user.id, query.page, query.limit);
  }

  @Post('conversations/:id/messages')
  @Auth()
  @ApiOperation({ summary: 'Send a message to a conversation', operationId: 'messagingSendMessage' })
  @ApiResponse({ status: 201, description: 'The created message', type: Message })
  @ApiResponse({ status: 403, description: 'You are not a participant of this conversation' })
  async sendMessage(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: SendMessageDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<Message> {
    return this.messagingService.sendMessage(
      id,
      req.user.id,
      dto.content,
      dto.referenceType !== undefined && dto.referenceId !== undefined
        ? { referenceType: dto.referenceType, referenceId: dto.referenceId }
        : undefined,
    );
  }

  @Get('notification-preferences')
  @Auth()
  @ApiOperation({
    summary: 'Get the authenticated user notification preferences',
    operationId: 'messagingGetNotificationPreferences',
  })
  @ApiResponse({ status: 200, description: 'The notification preferences', type: NotificationPreferenceDto })
  async getNotificationPreferences(@Req() req: AuthenticatedRequest): Promise<NotificationPreferenceDto> {
    return this.messagingService.getNotificationPreference(req.user.id);
  }

  @Patch('notification-preferences')
  @Auth()
  @ApiOperation({
    summary: 'Update the authenticated user notification preferences',
    operationId: 'messagingUpdateNotificationPreferences',
  })
  @ApiResponse({ status: 200, description: 'The updated notification preferences', type: NotificationPreferenceDto })
  async updateNotificationPreferences(
    @Body() dto: UpdateNotificationPreferenceDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<NotificationPreferenceDto> {
    return this.messagingService.updateNotificationPreference(req.user.id, dto);
  }
}
