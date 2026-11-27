import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsString, ValidateIf } from 'class-validator';

export class McpOAuthConsentPermissionDto {
  @ApiProperty({ example: 'resources.read' })
  key!: string;

  @ApiProperty({ description: 'English label from the permission catalog; the frontend translates by key.' })
  label!: string;

  @ApiProperty()
  description!: string;

  @ApiProperty({ example: 'resources' })
  category!: string;

  @ApiProperty({ type: String, nullable: true, description: 'Declaring plugin; null for core permissions.' })
  pluginName!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'German label of a plugin permission.' })
  labelDe!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'German description of a plugin permission.' })
  descriptionDe!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'English category heading of a plugin permission.' })
  categoryLabel!: string | null;

  @ApiProperty({ type: String, nullable: true, description: 'German category heading of a plugin permission.' })
  categoryLabelDe!: string | null;
}

export class McpOAuthConsentToolDto {
  @ApiProperty({ example: 'getAllResources', description: 'The tool name (an operation ID).' })
  name!: string;

  @ApiProperty({ description: 'First line of the tool description.' })
  summary!: string;

  @ApiProperty({ type: [String], description: 'Permissions that must all be held to use the tool.' })
  requiredAll!: string[];

  @ApiProperty({ type: [String], description: 'When not empty, at least one of these must be held.' })
  requiredAny!: string[];
}

export class McpOAuthConsentDto {
  @ApiProperty({ description: 'Name the client registered with. Not verified: never treat it as an identity.' })
  clientName!: string;

  @ApiProperty({
    description: 'True when the operator pre-registered the client; false for a self-registered (DCR) client.',
  })
  registeredByOperator!: boolean;

  @ApiProperty({ description: 'Where the browser returns to after the decision.' })
  redirectUri!: string;

  @ApiProperty({ description: 'Host of the redirect URI.' })
  redirectHost!: string;

  @ApiProperty({ description: 'True when the client runs on this device (localhost redirect).' })
  loopbackRedirect!: boolean;

  @ApiProperty({ type: [McpOAuthConsentPermissionDto], description: 'Permissions the client asks for.' })
  permissions!: McpOAuthConsentPermissionDto[];

  @ApiProperty({ description: 'True when the client did not name permissions and asks for all of yours.' })
  requestedAll!: boolean;

  @ApiProperty({ type: [String], description: 'Requested permissions the signed-in user does not hold.' })
  unavailablePermissions!: string[];

  @ApiProperty({ description: 'The MCP endpoint the access is for.' })
  resource!: string;

  @ApiProperty({
    type: [McpOAuthConsentPermissionDto],
    description: "The signed-in user's current permissions: what can be granted to the client. Sorted.",
  })
  availablePermissions!: McpOAuthConsentPermissionDto[];

  @ApiProperty({
    type: [String],
    description: 'The requested permission keys; every available key when the client asked for all.',
  })
  requestedPermissionKeys!: string[];

  @ApiProperty({
    type: [McpOAuthConsentToolDto],
    description: 'Tools that the full set of available permissions could unlock, to preview a selection locally.',
  })
  tools!: McpOAuthConsentToolDto[];

  @ApiProperty({ type: String, format: 'date-time' })
  expiresAt!: Date;
}

export class McpOAuthApproveDto {
  @ApiProperty({
    type: [String],
    description:
      "The permissions to grant: a non-empty subset of the signed-in user's current permissions. May exceed what the client requested.",
  })
  @ValidateIf((_, value) => value !== undefined)
  @IsArray()
  @IsString({ each: true })
  permissionKeys!: string[];
}

export class McpOAuthGrantDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ description: 'Name the client registered with (not verified); the client ID when it is gone.' })
  clientName!: string;

  @ApiProperty({ description: 'True when the operator pre-registered the client.' })
  registeredByOperator!: boolean;

  @ApiProperty({ type: [String] })
  permissionKeys!: string[];

  @ApiProperty({ type: String, format: 'date-time' })
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time', nullable: true })
  lastUsedAt!: Date | null;

  @ApiProperty({ type: String, format: 'date-time' })
  expiresAt!: Date;
}

export class McpOAuthRedirectDto {
  @ApiProperty({ description: 'Where to send the browser next: the client, with a code or an error.' })
  redirectUrl!: string;
}

export class McpConnectionInfoDto {
  @ApiProperty({ description: 'The MCP endpoint to add to an AI client.' })
  url!: string;

  @ApiProperty({
    description: 'True when clients can sign in with OAuth on this URL (https or loopback); API tokens always work.',
  })
  oauthEnabled!: boolean;
}
