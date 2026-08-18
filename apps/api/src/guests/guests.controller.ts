import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Auth } from '@attraccess/plugins-backend-sdk';
import { computeNextPage } from '../types/response';
import { GuestsService } from './guests.service';
import { CreateGuestDto } from './dtos/create-guest.dto';
import { UpdateGuestDto } from './dtos/update-guest.dto';
import { GuestDto } from './dtos/guest.dto';
import { GuestEnrollmentDto } from './dtos/guest-enrollment.dto';
import { CreateGuestResponseDto } from './dtos/create-guest-response.dto';
import { FindManyGuestsQueryDto } from './dtos/find-many-guests-query.dto';
import { PaginatedGuestsResponseDto } from './dtos/paginated-guests-response.dto';
import { GuestAccessDto } from './dtos/guest-access.dto';

@ApiTags('Guests')
@Controller('guests')
export class GuestsController {
  constructor(private readonly guestsService: GuestsService) {}

  @Post()
  @Auth('users.create')
  @ApiOperation({ summary: 'Create a guest account and provision its TOTP credential', operationId: 'createGuest' })
  @ApiResponse({ status: 201, description: 'The guest has been created.', type: CreateGuestResponseDto })
  async create(@Body() body: CreateGuestDto): Promise<CreateGuestResponseDto> {
    return this.guestsService.create(body);
  }

  @Get()
  @Auth('users.read')
  @ApiOperation({ summary: 'Get a paginated list of guest accounts', operationId: 'findManyGuests' })
  @ApiResponse({ status: 200, description: 'List of guests.', type: PaginatedGuestsResponseDto })
  async findMany(@Query() query: FindManyGuestsQueryDto): Promise<PaginatedGuestsResponseDto> {
    const result = await this.guestsService.findMany({
      page: query.page,
      limit: query.limit,
      search: query.search,
    });
    return {
      ...result,
      nextPage: computeNextPage(result.page, result.limit, result.total),
    };
  }

  @Get(':id')
  @Auth('users.read')
  @ApiOperation({ summary: 'Get a guest account by ID', operationId: 'getGuestById' })
  @ApiResponse({ status: 200, description: 'The guest with the specified ID.', type: GuestDto })
  async getOneById(@Param('id', ParseIntPipe) id: number): Promise<GuestDto> {
    return this.guestsService.findOne(id);
  }

  @Get(':id/access')
  @Auth('users.read')
  @ApiOperation({
    summary: 'List the resource and group introductions that grant a guest access',
    operationId: 'getGuestAccess',
  })
  @ApiResponse({ status: 200, description: 'The guest access entries.', type: GuestAccessDto })
  async getAccess(@Param('id', ParseIntPipe) id: number): Promise<GuestAccessDto> {
    return this.guestsService.getAccess(id);
  }

  @Patch(':id')
  @Auth('users.update')
  @ApiOperation({ summary: 'Update a guest account (name, email, enabled state)', operationId: 'updateGuest' })
  @ApiResponse({ status: 200, description: 'The updated guest.', type: GuestDto })
  async update(@Param('id', ParseIntPipe) id: number, @Body() body: UpdateGuestDto): Promise<GuestDto> {
    return this.guestsService.update(id, body);
  }

  @Delete(':id')
  @Auth('users.delete')
  @ApiOperation({ summary: 'Delete a guest account', operationId: 'deleteGuest' })
  @ApiResponse({ status: 200, description: 'Guest deleted.' })
  async delete(@Param('id', ParseIntPipe) id: number): Promise<void> {
    await this.guestsService.delete(id);
  }

  @Get(':id/enrollment')
  @Auth('users.update')
  @ApiOperation({
    summary: 'Get the current TOTP enrollment (QR / otpauth URI / secret) for a guest',
    operationId: 'getGuestEnrollment',
  })
  @ApiResponse({ status: 200, description: 'The current enrollment.', type: GuestEnrollmentDto })
  async getEnrollment(@Param('id', ParseIntPipe) id: number): Promise<GuestEnrollmentDto> {
    return this.guestsService.getEnrollment(id);
  }

  @Post(':id/enrollment/rotate')
  @Auth('users.update')
  @ApiOperation({
    summary: 'Rotate the TOTP credential of a guest, invalidating the previous secret',
    operationId: 'rotateGuestEnrollment',
  })
  @ApiResponse({ status: 200, description: 'The new enrollment.', type: GuestEnrollmentDto })
  async rotate(@Param('id', ParseIntPipe) id: number): Promise<GuestEnrollmentDto> {
    return this.guestsService.rotate(id);
  }

  @Delete(':id/enrollment')
  @Auth('users.update')
  @ApiOperation({
    summary: 'Revoke the TOTP credential of a guest',
    operationId: 'revokeGuestEnrollment',
  })
  @ApiResponse({ status: 200, description: 'Credential revoked.', type: GuestDto })
  async revoke(@Param('id', ParseIntPipe) id: number): Promise<GuestDto> {
    return this.guestsService.revokeCredential(id);
  }
}
