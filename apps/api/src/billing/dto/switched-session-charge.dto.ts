import { ApiProperty, ApiSchema } from '@nestjs/swagger';

@ApiSchema({ name: 'SwitchedSessionCharge' })
export class SwitchedSessionChargeDto {
  @ApiProperty({
    description: 'A later part follows: the charged part ended at a project switch, not with the session',
  })
  continues!: boolean;

  @ApiProperty({
    description: "The owner's completed charges (bills and meter corrections) of this part and all parts before it",
    example: -2200,
  })
  sessionAmount!: number;

  @ApiProperty({ description: 'The name of the resource of the session' })
  resourceName!: string;
}
