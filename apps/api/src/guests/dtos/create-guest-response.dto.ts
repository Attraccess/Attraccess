import { ApiProperty } from '@nestjs/swagger';
import { GuestDto } from './guest.dto';
import { GuestEnrollmentDto } from './guest-enrollment.dto';

export class CreateGuestResponseDto {
  @ApiProperty({ type: GuestDto })
  guest: GuestDto;

  @ApiProperty({
    type: GuestEnrollmentDto,
    description: 'The TOTP enrollment (QR / otpauth URI / secret) to share with the guest',
  })
  enrollment: GuestEnrollmentDto;
}
