import { ApiProperty } from '@nestjs/swagger';

/**
 * Serialized, client-safe view of a pending in-memory supervision request.
 */
export class SupervisionRequestDto {
  @ApiProperty({ description: 'The opaque identifier of the supervision request', example: 'b1d4...-uuid' })
  id!: string;

  @ApiProperty({ description: 'The resource the requester wants to use', example: 1 })
  resourceId!: number;

  @ApiProperty({ description: 'The ID of the user requesting the supervised session', example: 7 })
  requesterUserId!: number;

  @ApiProperty({ description: 'The username of the requester', example: 'alice' })
  requesterUsername!: string;

  @ApiProperty({ description: 'The ID of the supervisor whose approval is required', example: 42 })
  supervisorUserId!: number;

  @ApiProperty({ description: 'Optional notes supplied by the requester', required: false, nullable: true })
  notes!: string | null;

  @ApiProperty({ description: 'When the request was created' })
  createdAt!: Date;

  @ApiProperty({ description: 'When the request lapses if not answered (30s after creation)' })
  expiresAt!: Date;
}
