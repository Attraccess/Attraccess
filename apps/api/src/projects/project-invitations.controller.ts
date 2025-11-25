import { Controller, Get, Param, ParseIntPipe, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Auth, AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { ProjectInvitation } from '@attraccess/database-entities';
import { ProjectsService } from './projects.service';

@ApiTags('Project Invitations')
@Controller('project-invitations')
export class ProjectInvitationsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  @Auth()
  @ApiOperation({
    summary: 'List pending project invitations for the authenticated user',
    operationId: 'listMyProjectInvitations',
  })
  @ApiResponse({ status: 200, type: ProjectInvitation, isArray: true })
  async listMyInvitations(@Req() req: AuthenticatedRequest): Promise<ProjectInvitation[]> {
    return await this.projectsService.listPendingInvitationsForUser(req.user.id);
  }

  @Post(':invitationId/accept')
  @Auth()
  @ApiOperation({ summary: 'Accept a project invitation', operationId: 'acceptProjectInvitation' })
  @ApiResponse({ status: 200, type: ProjectInvitation })
  async acceptInvitation(
    @Req() req: AuthenticatedRequest,
    @Param('invitationId', ParseIntPipe) invitationId: number,
  ): Promise<ProjectInvitation> {
    return await this.projectsService.acceptInvitation(req.user.id, invitationId);
  }

  @Post(':invitationId/decline')
  @Auth()
  @ApiOperation({ summary: 'Decline a project invitation', operationId: 'declineProjectInvitation' })
  @ApiResponse({ status: 200, type: ProjectInvitation })
  async declineInvitation(
    @Req() req: AuthenticatedRequest,
    @Param('invitationId', ParseIntPipe) invitationId: number,
  ): Promise<ProjectInvitation> {
    return await this.projectsService.declineInvitation(req.user.id, invitationId);
  }
}
