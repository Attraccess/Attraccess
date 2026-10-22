import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches } from 'class-validator';
export class ApproveEnrollmentDto {
  @ApiProperty({ example: 'ABC-123', pattern: '^[A-Z0-9]{3}-[A-Z0-9]{3}$' })
  @IsString()
  @Matches(/^[A-Z0-9]{3}-[A-Z0-9]{3}$/)
  code!: string;
}
export class ApproveEnrollmentResponseDto {
  @ApiProperty()
  id!: number;
}
