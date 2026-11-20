import { Controller, Get, Param, ParseIntPipe, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Auth, AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { ProjectInvitationDto, toProjectInvitationDto } from './dto/project.dto';
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
  @ApiResponse({ status: 200, type: ProjectInvitationDto, isArray: true })
  async listMyInvitations(@Req() req: AuthenticatedRequest): Promise<ProjectInvitationDto[]> {
    return (await this.projectsService.listPendingInvitationsForUser(req.user.id)).map(toProjectInvitationDto);
  }

  @Post(':invitationId/accept')
  @Auth()
  @ApiOperation({ summary: 'Accept a project invitation', operationId: 'acceptProjectInvitation' })
  @ApiResponse({ status: 200, type: ProjectInvitationDto })
  async acceptInvitation(
    @Req() req: AuthenticatedRequest,
    @Param('invitationId', ParseIntPipe) invitationId: number,
  ): Promise<ProjectInvitationDto> {
    return toProjectInvitationDto(
      await this.projectsService.acceptInvitation(
        req.user.id,
        invitationId,
        req.user.authenticationMethod ?? 'session',
        req.user.apiTokenId,
      ),
    );
  }

  @Post(':invitationId/decline')
  @Auth()
  @ApiOperation({ summary: 'Decline a project invitation', operationId: 'declineProjectInvitation' })
  @ApiResponse({ status: 200, type: ProjectInvitationDto })
  async declineInvitation(
    @Req() req: AuthenticatedRequest,
    @Param('invitationId', ParseIntPipe) invitationId: number,
  ): Promise<ProjectInvitationDto> {
    return toProjectInvitationDto(
      await this.projectsService.declineInvitation(
        req.user.id,
        invitationId,
        req.user.authenticationMethod ?? 'session',
        req.user.apiTokenId,
      ),
    );
  }
}
