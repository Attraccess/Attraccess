import { ApiProperty } from '@nestjs/swagger';

export class IntroducerDirectoryEntryDto {
  @ApiProperty()
  id!: number;

  @ApiProperty()
  username!: string;
}
