import { ProjectInvitation } from '@attraccess/database-entities';
import { Auth, AuthenticatedRequest } from '@attraccess/plugins-backend-sdk';
import { Body, Delete, Get, Param, ParseIntPipe, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiResponse } from '@nestjs/swagger';
import { CreateProjectInvitationDto } from './dto/create-project-invitation.dto';
import { ProjectMembersResponseDto } from './dto/project-members-response.dto';
import { ProjectsControllerRouteContext } from './projects.controller.route-context';
export abstract class ProjectMembershipRoutes extends ProjectsControllerRouteContext {
  @Get(':id/members')
  @Auth()
  @ApiOperation({ summary: 'List project members', operationId: 'listProjectMembers' })
  @ApiResponse({ status: 200, type: ProjectMembersResponseDto })
  async listMembers(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ProjectMembersResponseDto> {
    const project = await this.projectAccessService.ensureOwner(req.user.id, id);
    const members = await this.projectsService.listMembers(id);

    return {
      owner: project.owner,
      members,
    };
  }

  @Delete(':id/members/:memberId')
  @Auth()
  @ApiOperation({ summary: 'Remove a project member', operationId: 'removeProjectMember' })
  @ApiResponse({ status: 204 })
  async removeMember(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Param('memberId', ParseIntPipe) memberId: number,
  ): Promise<void> {
    await this.projectsService.removeMember(
      req.user.id,
      id,
      memberId,
      req.user.authenticationMethod ?? 'session',
      req.user.apiTokenId,
    );
  }

  @Get(':id/invitations')
  @Auth()
  @ApiOperation({ summary: 'List project invitations', operationId: 'listProjectInvitations' })
  @ApiResponse({ status: 200, type: ProjectInvitation, isArray: true })
  async listInvitations(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<ProjectInvitation[]> {
    await this.projectAccessService.ensureOwner(req.user.id, id);
    return await this.projectsService.listProjectInvitations(id);
  }

  @Post(':id/invitations')
  @Auth()
  @ApiOperation({ summary: 'Create a project invitation', operationId: 'createProjectInvitation' })
  @ApiResponse({ status: 201, type: ProjectInvitation })
  async createInvitation(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Body() data: CreateProjectInvitationDto,
  ): Promise<ProjectInvitation> {
    return await this.projectsService.createProjectInvitation(
      req.user.id,
      id,
      data.invitedUserId,
      data.role,
      req.user.authenticationMethod ?? 'session',
      req.user.apiTokenId,
    );
  }

  @Post(':id/invitations/:invitationId/resend')
  @Auth()
  @ApiOperation({ summary: 'Resend a project invitation', operationId: 'resendProjectInvitation' })
  @ApiResponse({ status: 200, type: ProjectInvitation })
  async resendInvitation(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Param('invitationId', ParseIntPipe) invitationId: number,
  ): Promise<ProjectInvitation> {
    return await this.projectsService.resendProjectInvitation(
      req.user.id,
      id,
      invitationId,
      req.user.authenticationMethod ?? 'session',
      req.user.apiTokenId,
    );
  }

  @Delete(':id/invitations/:invitationId')
  @Auth()
  @ApiOperation({ summary: 'Cancel a project invitation', operationId: 'cancelProjectInvitation' })
  @ApiResponse({ status: 200, type: ProjectInvitation })
  async cancelInvitation(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseIntPipe) id: number,
    @Param('invitationId', ParseIntPipe) invitationId: number,
  ): Promise<ProjectInvitation> {
    return await this.projectsService.cancelProjectInvitation(
      req.user.id,
      id,
      invitationId,
      req.user.authenticationMethod ?? 'session',
      req.user.apiTokenId,
    );
  }
}
