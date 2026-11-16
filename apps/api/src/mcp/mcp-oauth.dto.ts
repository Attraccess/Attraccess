import { ApiProperty } from '@nestjs/swagger';

export class McpOAuthConsentDto {
  @ApiProperty({ description: 'Name the client registered with. Not verified: never treat it as an identity.' })
  clientName!: string;

  @ApiProperty({ description: 'Where the browser returns to after the decision.' })
  redirectUri!: string;

  @ApiProperty({ description: 'Host of the redirect URI.' })
  redirectHost!: string;

  @ApiProperty({ description: 'True when the client runs on this device (localhost redirect).' })
  loopbackRedirect!: boolean;

  @ApiProperty({ type: [String], description: 'Permissions the client asks for.' })
  permissions!: string[];

  @ApiProperty({ description: 'True when the client did not name permissions and asks for all of yours.' })
  requestedAll!: boolean;

  @ApiProperty({ type: [String], description: 'Requested permissions the signed-in user does not hold.' })
  unavailablePermissions!: string[];

  @ApiProperty({ description: 'The MCP endpoint the access is for.' })
  resource!: string;

  @ApiProperty({ type: String, format: 'date-time' })
  expiresAt!: Date;
}

export class McpOAuthRedirectDto {
  @ApiProperty({ description: 'Where to send the browser next: the client, with a code or an error.' })
  redirectUrl!: string;
}
