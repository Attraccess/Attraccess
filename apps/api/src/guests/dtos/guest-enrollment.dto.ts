import { ApiProperty } from '@nestjs/swagger';

export class GuestEnrollmentDto {
  @ApiProperty({
    description: 'The short numeric code the guest enters at the terminal to identify themselves',
    example: '1234',
  })
  guestCode: string;

  @ApiProperty({
    description: 'The shared TOTP secret for manual entry into an authenticator app',
    example: 'JBSWY3DPEHPK3PXP',
  })
  secret: string;

  @ApiProperty({
    description: 'The otpauth URL to render as a QR code for the authenticator app',
    example: 'otpauth://totp/Attraccess:John%20Doe?secret=JBSWY3DPEHPK3PXP&issuer=Attraccess',
  })
  otpauthUrl: string;
}
