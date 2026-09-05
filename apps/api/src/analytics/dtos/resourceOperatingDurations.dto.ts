import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsDate,
  IsInt,
  Min,
  Validate,
  ValidationArguments,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

export const MAX_RESOURCE_IDS_PER_REPORT = 100;
export const MAX_REPORT_DURATION_MS = 31 * 24 * 60 * 60_000;

@ValidatorConstraint({ name: 'reportDateRange', async: false })
class ReportDateRangeConstraint implements ValidatorConstraintInterface {
  validate(end: Date, { object }: ValidationArguments): boolean {
    const start = (object as ResourceOperatingDurationsDto).start;
    return (
      start instanceof Date &&
      end instanceof Date &&
      end.getTime() > start.getTime() &&
      end.getTime() - start.getTime() <= MAX_REPORT_DURATION_MS
    );
  }

  defaultMessage(): string {
    return 'The report date range must be positive and no longer than 31 days';
  }
}

export class ResourceOperatingDurationsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_RESOURCE_IDS_PER_REPORT)
  @IsInt({ each: true })
  @Min(1, { each: true })
  resourceIds!: number[];

  @Type(() => Date)
  @IsDate()
  start!: Date;

  @Type(() => Date)
  @IsDate()
  @Validate(ReportDateRangeConstraint)
  end!: Date;
}
