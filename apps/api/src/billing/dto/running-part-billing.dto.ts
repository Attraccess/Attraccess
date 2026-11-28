import { ApiProperty, ApiSchema } from '@nestjs/swagger';

@ApiSchema({ name: 'RunningPartBilling' })
export class RunningPartBillingDto {
  @ApiProperty({ description: 'The fee per use this part pays; 0 when the session paid it already', example: 0 })
  flatCredits!: number;

  @ApiProperty({
    type: Date,
    description:
      'The billed minutes of the part are the started minutes from here to its end, less those from here to its start',
  })
  roundingStartTime!: Date;

  @ApiProperty({
    description:
      'What the earlier parts of the same rounding charged, before the billing factor, which is rounded on the running total',
    example: 1400,
  })
  priorCredits!: number;
}
