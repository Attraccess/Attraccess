import { ApiProperty } from '@nestjs/swagger';

export class SharedMachineFlowEffectNodeDto {
  @ApiProperty({ description: 'The id of the node with an external effect', example: 'TGVgqDzCKXKVr-XGUD5V3' })
  nodeId: string;

  @ApiProperty({ description: 'The type of the node with an external effect', example: 'output.http.sendRequest' })
  nodeType: string;
}

export class SharedMachineFlowWarningDto {
  @ApiProperty({
    description: "The id of the global flow the trigger belongs to; null for the resource's own flow",
    nullable: true,
    type: Number,
  })
  flowId: number | null;

  @ApiProperty({
    description: "The name of the global flow; null for the resource's own flow",
    nullable: true,
    type: String,
  })
  flowName: string | null;

  @ApiProperty({
    description: 'The id of the session start, stop or takeover trigger',
    example: 'TGVgqDzCKXKVr-XGUD5V3',
  })
  triggerNodeId: string;

  @ApiProperty({ description: 'The type of the trigger', example: 'input.resource.usage.stopped' })
  triggerType: string;

  @ApiProperty({
    description: 'External effects reached from the trigger without checking the number of active sessions',
    type: SharedMachineFlowEffectNodeDto,
    isArray: true,
  })
  effectNodes: SharedMachineFlowEffectNodeDto[];
}
