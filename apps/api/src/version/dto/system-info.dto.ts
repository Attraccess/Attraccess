import { ApiProperty } from '@nestjs/swagger';

export class SystemInfoDto {
  @ApiProperty({ description: 'Process uptime in seconds', example: 3600 })
  uptimeSeconds!: number;

  @ApiProperty({ description: 'Node.js runtime version', example: 'v22.0.0' })
  nodeVersion!: string;

  @ApiProperty({ description: 'Total registered users', example: 42 })
  usersTotal!: number;

  @ApiProperty({ description: 'Total resources', example: 15 })
  resourcesTotal!: number;

  @ApiProperty({ description: 'Active authenticated sessions', example: 7 })
  activeAuthSessions!: number;

  @ApiProperty({ description: 'Active resource usage sessions', example: 3 })
  activeResourceUsageSessions!: number;

  @ApiProperty({ description: 'Total projects', example: 5 })
  projectsTotal!: number;
}
