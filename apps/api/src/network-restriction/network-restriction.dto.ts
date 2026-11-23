import { ApiProperty } from '@nestjs/swagger';
import { NetworkIpSource, NetworkRestrictedAction } from '@attraccess/application-models';

export class NetworkRestrictionStatusDto {
  @ApiProperty({ description: 'Whether the network restriction is switched on' })
  enabled!: boolean;

  @ApiProperty({ description: 'Whether the caller comes from the allowed network (true while the restriction is off)' })
  insideAllowedNetwork!: boolean;

  @ApiProperty({
    enum: NetworkRestrictedAction,
    enumName: 'NetworkRestrictedAction',
    isArray: true,
    description: 'Actions the caller may do from here',
  })
  allowedFromHere!: NetworkRestrictedAction[];
}

export class NetworkRestrictionSettingsDto {
  @ApiProperty() enabled!: boolean;

  @ApiProperty({ type: [String], description: 'IP addresses and CIDR ranges (IPv4 and IPv6) of the allowed network' })
  allowedRanges!: string[];

  @ApiProperty({ enum: NetworkIpSource, enumName: 'NetworkIpSource' }) ipSource!: NetworkIpSource;

  @ApiProperty({ example: 'X-Real-Ip', description: 'Header read when ipSource is "header"' })
  headerName!: string;

  @ApiProperty({
    type: String,
    nullable: true,
    description: "The address of the administrator's own request, if known",
  })
  detectedAddress!: string | null;

  @ApiProperty({ description: "Whether the administrator's own request is inside the allowed ranges" })
  detectedInside!: boolean;
}

export class UpdateNetworkRestrictionSettingsDto {
  @ApiProperty({ required: false }) enabled?: boolean;
  @ApiProperty({ type: [String], required: false }) allowedRanges?: string[];
  @ApiProperty({ enum: NetworkIpSource, enumName: 'NetworkIpSource', required: false }) ipSource?: NetworkIpSource;
  @ApiProperty({ required: false }) headerName?: string;
}

export class NetworkRestrictionRoleActionsDto {
  @ApiProperty() roleId!: number;
  @ApiProperty() key!: string;
  @ApiProperty() name!: string;
  @ApiProperty({
    enum: NetworkRestrictedAction,
    enumName: 'NetworkRestrictedAction',
    isArray: true,
    description: 'Actions allowed from outside',
  })
  actions!: NetworkRestrictedAction[];
}

export class NetworkRestrictionRoleMatrixDto {
  @ApiProperty({
    enum: NetworkRestrictedAction,
    enumName: 'NetworkRestrictedAction',
    isArray: true,
    description: 'All restrictable actions',
  })
  actions!: NetworkRestrictedAction[];

  @ApiProperty({ type: [NetworkRestrictionRoleActionsDto] })
  roles!: NetworkRestrictionRoleActionsDto[];
}

export class UpdateNetworkRestrictionRoleActionDto {
  @ApiProperty() roleId!: number;
  @ApiProperty({ enum: NetworkRestrictedAction, enumName: 'NetworkRestrictedAction', isArray: true })
  actions!: NetworkRestrictedAction[];
}

export class UpdateNetworkRestrictionRoleMatrixDto {
  @ApiProperty({
    type: [UpdateNetworkRestrictionRoleActionDto],
    description: 'Replaces the action set of each role listed',
  })
  roles!: UpdateNetworkRestrictionRoleActionDto[];
}
