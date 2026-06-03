import { ApiProperty } from '@nestjs/swagger';

export class SymbolicateCoredumpDto {
  @ApiProperty({ type: 'string', format: 'binary', description: 'The raw ESP32 coredump blob' })
  coredump: unknown;

  @ApiProperty({
    description: 'Firmware name to resolve the ELF for. Omit to auto-match by build id.',
    required: false,
    example: 'attractap',
  })
  firmwareName?: string;

  @ApiProperty({
    description: 'Firmware variant to resolve the ELF for. Omit to auto-match by build id.',
    required: false,
    example: 'eth',
  })
  variantName?: string;
}

export class CoredumpFrameDto {
  @ApiProperty({ description: 'Zero-based frame index in the backtrace', example: 0 })
  index: number;

  @ApiProperty({ description: 'Program counter for the frame', example: '0x42066718' })
  pc: string;

  @ApiProperty({ description: 'Resolved function name, if available', required: false, example: 'panic_abort' })
  function?: string;

  @ApiProperty({ description: 'Resolved source file, if available', required: false, example: 'panic.c' })
  file?: string;

  @ApiProperty({ description: 'Resolved source line, if available', required: false, example: 408 })
  line?: number;
}

export class CoredumpTaskDto {
  @ApiProperty({ description: 'FreeRTOS task name', example: 'websocket_task' })
  name: string;

  @ApiProperty({ description: 'Task control block address', required: false, example: '0x3fcf4a08' })
  tcb?: string;

  @ApiProperty({ description: 'Whether this task was the one that crashed', example: true })
  isCrashed: boolean;
}

export class CoredumpSymbolicationResultDto {
  @ApiProperty({ description: 'Firmware name the ELF was resolved for', example: 'attractap' })
  firmwareName: string;

  @ApiProperty({ description: 'Firmware variant the ELF was resolved for', example: 'eth' })
  variantName: string;

  @ApiProperty({ description: 'How the ELF was matched to the coredump', enum: ['buildId', 'versionVariant'] })
  matchedBy: 'buildId' | 'versionVariant';

  @ApiProperty({ description: 'Build id read from the coredump, if present', required: false, example: 'f6899cb1067e5043' })
  buildId?: string;

  @ApiProperty({ description: 'Panic / abort reason line', required: false, example: 'abort() was called at PC 0x42066718 on core 0' })
  panicReason?: string;

  @ApiProperty({ description: 'CPU core the crash occurred on', required: false, example: 0 })
  faultingCore?: number;

  @ApiProperty({ description: 'Name of the task that crashed', required: false, example: 'websocket_task' })
  faultingTaskName?: string;

  @ApiProperty({ description: 'Symbolized backtrace frames', type: [CoredumpFrameDto] })
  backtrace: CoredumpFrameDto[];

  @ApiProperty({ description: 'Tasks present at crash time', type: [CoredumpTaskDto] })
  tasks: CoredumpTaskDto[];

  @ApiProperty({ description: 'Full symbolized tool output for deep inspection' })
  rawText: string;
}
