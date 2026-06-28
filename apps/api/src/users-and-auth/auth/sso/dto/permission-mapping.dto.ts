import { ApiProperty } from '@nestjs/swagger';

// ponytail: index-signature class — class-validator skips dynamic keys, so the parent DTO
// uses @IsObject() for shallow validation. Keys are any RBAC role key (system or user-defined).
export class SSOPermissionMappingsDto {
  @ApiProperty({
    description:
      'Maps any RBAC role key (system-provided or user-defined) to the SSO role names that should grant it.',
    type: 'object',
    additionalProperties: { type: 'array', items: { type: 'string' } },
    example: {
      'resource-manager': ['attraccess_resources'],
      'system-admin': ['attraccess_config_admin'],
      'my-custom-role': ['my_sso_group'],
    },
  })
  [rbacRoleKey: string]: string[];
}
