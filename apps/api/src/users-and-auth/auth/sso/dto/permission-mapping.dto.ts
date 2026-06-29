// ponytail: index-signature class — class-validator skips dynamic keys, so the parent DTO
// uses @IsObject() for shallow validation. Keys are any RBAC role key (system or user-defined).
export class SSOPermissionMappingsDto {
  [rbacRoleKey: string]: string[];
}
