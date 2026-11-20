import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDefined,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  Validate,
  ValidateIf,
  ValidateNested,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';
import type { DashboardPinItemType, DashboardPinSize } from '@attraccess/application-models';
import { DASHBOARD_WIDGET_ID_PATTERN } from '../../plugin-system/runtime/manifest-schema';

export const DASHBOARD_PIN_ITEM_TYPES: DashboardPinItemType[] = ['page', 'resource', 'widget'];
export const DASHBOARD_PIN_OPERATIONS = ['add', 'remove', 'move', 'resize'] as const;
export const DASHBOARD_PIN_SIZES: DashboardPinSize[] = ['small', 'medium', 'large'];
export type DashboardPinOperationKind = (typeof DASHBOARD_PIN_OPERATIONS)[number];

// A page is a route path of plain segments, without query, hash or traversal. A resource is a positive integer in
// canonical form, so "7" and "007" cannot both be pinned. A widget is a lowercase kebab-case id of at most 64 characters.
const ITEM_ID_PATTERNS: Record<DashboardPinItemType, RegExp> = {
  page: /^(\/[A-Za-z0-9_-]+)+$/,
  resource: /^[1-9][0-9]{0,14}$/,
  widget: DASHBOARD_WIDGET_ID_PATTERN,
};

@ValidatorConstraint({ name: 'dashboardPinItemId' })
class DashboardPinItemIdConstraint implements ValidatorConstraintInterface {
  validate(itemId: unknown, args: ValidationArguments): boolean {
    const pattern = ITEM_ID_PATTERNS[(args.object as DashboardPinItemDto).itemType];
    return typeof itemId === 'string' && !!pattern && pattern.test(itemId);
  }

  defaultMessage(): string {
    return 'itemId must be a route path for page pins, a resource id for resource pins and a widget id for widget pins';
  }
}

export class DashboardPinItemDto {
  @ApiProperty({ enum: DASHBOARD_PIN_ITEM_TYPES, enumName: 'DashboardPinItemType', example: 'page' })
  @IsIn(DASHBOARD_PIN_ITEM_TYPES)
  itemType!: DashboardPinItemType;

  @ApiProperty({
    description:
      'The route path of a page pin (e.g. "/projects"), the id of a resource pin (e.g. "42"), or the id of a widget pin (e.g. "messages")',
    example: '/projects',
  })
  @IsString()
  @MaxLength(200)
  @Validate(DashboardPinItemIdConstraint)
  itemId!: string;
}

export class DashboardPinDto extends DashboardPinItemDto {
  @ApiProperty({ description: 'The name of a pinned resource', required: false, example: 'Laser cutter' })
  resourceName?: string;

  @ApiProperty({
    enum: DASHBOARD_PIN_SIZES,
    enumName: 'DashboardPinSize',
    nullable: true,
    description: "The tile size the user chose. Null shows the item's default size.",
  })
  size!: DashboardPinSize | null;
}

export class UpdateDashboardPinsDto {
  @ApiProperty({
    enum: DASHBOARD_PIN_OPERATIONS,
    enumName: 'DashboardPinOperationKind',
    description:
      'add appends the item, remove deletes it, move places it before `before` (or last), resize sets its `size`',
  })
  @IsIn(DASHBOARD_PIN_OPERATIONS)
  kind!: DashboardPinOperationKind;

  @ApiProperty({ type: DashboardPinItemDto })
  @IsDefined()
  @ValidateNested()
  @Type(() => DashboardPinItemDto)
  item!: DashboardPinItemDto;

  @ApiProperty({
    type: DashboardPinItemDto,
    required: false,
    description: 'For move: the pin to place the item before. Omit to move it to the end. Ignored by add and remove.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => DashboardPinItemDto)
  before?: DashboardPinItemDto;

  @ApiProperty({
    enum: DASHBOARD_PIN_SIZES,
    enumName: 'DashboardPinSize',
    required: false,
    description:
      'For add: the tile size (omit for the default). For resize: the new size, required. Ignored otherwise.',
  })
  @ValidateIf((dto: UpdateDashboardPinsDto) => dto.kind === 'resize' || dto.size !== undefined)
  @IsIn(DASHBOARD_PIN_SIZES)
  size?: DashboardPinSize;
}
