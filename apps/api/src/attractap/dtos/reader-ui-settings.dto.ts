import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class ReaderUiPluginSettingsDto {
  @ApiProperty({ description: 'Plugin name', example: 'reservations' })
  @IsString()
  @MaxLength(100)
  plugin!: string;

  @ApiProperty({ description: 'Whether this plugin may show widgets on readers of this resource', default: true })
  @IsBoolean()
  widgetsEnabled!: boolean;

  @ApiProperty({
    description: 'What happens to starts when the plugin hook fails: block (fail-closed) or allow (fail-open, audited)',
    enum: ['fail-closed', 'fail-open'],
    default: 'fail-closed',
  })
  @IsIn(['fail-closed', 'fail-open'])
  hookFailurePolicy!: 'fail-closed' | 'fail-open';
}

export class ResourceReaderUiSettingsDto {
  @ApiProperty({
    description: 'Override for readers without a screen. Null uses the plugin default (block when none).',
    enum: ['block', 'card-confirm', 'allow-with-warning'],
    nullable: true,
  })
  @IsOptional()
  @IsIn(['block', 'card-confirm', 'allow-with-warning', null])
  noScreenPolicy!: 'block' | 'card-confirm' | 'allow-with-warning' | null;

  @ApiProperty({ type: () => [ReaderUiPluginSettingsDto] })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => ReaderUiPluginSettingsDto)
  plugins!: ReaderUiPluginSettingsDto[];
}

export class ReaderReaderUiSettingsDto {
  @ApiProperty({ description: 'Whether plugin widgets are shown on this reader', default: true })
  @IsBoolean()
  widgetsEnabled!: boolean;
}

export class ReaderUiAlertDto {
  @ApiProperty() id!: number;
  @ApiProperty({ enum: ['breaker-open', 'load-failure', 'crash-loop'] }) kind!: string;
  @ApiProperty({ nullable: true, type: String }) plugin!: string | null;
  @ApiProperty({ nullable: true, type: Number }) readerId!: number | null;
  @ApiProperty() message!: string;
  @ApiProperty() createdAt!: Date;
}

export class ReaderUiContributionStatusDto {
  @ApiProperty() plugin!: string;
  @ApiProperty() resourceId!: number;
  @ApiProperty() slot!: string;
  @ApiProperty() key!: string;
  @ApiProperty({ enum: ['rendered', 'degraded', 'skipped'] }) status!: 'rendered' | 'degraded' | 'skipped';
  @ApiProperty({ required: false }) reason?: string;
}
