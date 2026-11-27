import { ApiProperty, ApiSchema } from '@nestjs/swagger';
import { ResourceUsageResponseDto } from './resource-usage-response.dto';

/** The session an end request ended, plus what became of the maintenance request sent with it. */
@ApiSchema({ name: 'EndedResourceUsage' })
export class EndedUsageSessionResponseDto extends ResourceUsageResponseDto {
  @ApiProperty({
    description:
      'Only present when the request carried `maintenanceRequest`: whether that maintenance request was filed. The session is ended either way.',
    required: false,
    type: Boolean,
  })
  maintenanceRequestFiled?: boolean;
}
