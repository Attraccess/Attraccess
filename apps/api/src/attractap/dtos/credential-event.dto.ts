import { ApiProperty, ApiSchema } from '@nestjs/swagger';
import type { AttractapCredentialEventRecord, AttractapCredentialEventState } from '@attraccess/application-models';

/** One entry of a reader's credential history. */
@ApiSchema({ name: 'AttractapCredentialEvent' })
export class AttractapCredentialEventDto {
  @ApiProperty({ description: 'The event ID' })
  id!: number;

  @ApiProperty({ description: 'The reader ID (kept after the reader is deleted)' })
  readerId!: number;

  @ApiProperty({ description: 'Reader name at the time of the event' })
  readerName!: string;

  @ApiProperty({ description: 'SHA-256 fingerprint of the reader public key' })
  keyFingerprint!: string;

  @ApiProperty({ description: 'Serial number of the issued reader certificate', nullable: true })
  certificateSerial!: string | null;

  @ApiProperty({ enum: ['paired', 'revoked', 'replaced'] })
  state!: AttractapCredentialEventState;

  @ApiProperty({ description: 'The user responsible for the event', nullable: true })
  actorId!: number | null;

  @ApiProperty()
  createdAt!: Date;
}

export function toCredentialEventDto(event: AttractapCredentialEventRecord): AttractapCredentialEventDto {
  return {
    id: event.id,
    readerId: event.readerId,
    readerName: event.readerName,
    keyFingerprint: event.keyFingerprint,
    certificateSerial: event.certificateSerial,
    state: event.state,
    actorId: event.actorId,
    createdAt: event.createdAt,
  };
}
