import { ApiProperty } from '@nestjs/swagger';
import { PaginatedResponseWithNextPage } from '../../types/response';
import { GuestDto } from './guest.dto';

export class PaginatedGuestsResponseDto extends PaginatedResponseWithNextPage<GuestDto> {
  @ApiProperty({ type: [GuestDto] })
  data: GuestDto[];
}
