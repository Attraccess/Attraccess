import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsPositive, ValidateIf, ValidateNested } from 'class-validator';
import { FormSubmissionRequestDto } from '../../forms/dto';

export class SwitchUsageSessionProjectDto {
  @ApiProperty({
    description: 'The project to continue the session under, or null to continue it without a project',
    nullable: true,
    type: Number,
    example: 35,
  })
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  @IsPositive()
  projectId!: number | null;

  @ApiProperty({
    description:
      "The running session to switch. Without it the caller's own running session is switched. With it, a session that ended meanwhile is reported as not found instead of switching its successor.",
    required: false,
    type: Number,
    example: 1204,
  })
  @IsOptional()
  @IsInt()
  @IsPositive()
  usageId?: number;

  @ApiProperty({
    description: 'Submissions of the forms required for the project-switch action',
    required: false,
    type: () => FormSubmissionRequestDto,
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => FormSubmissionRequestDto)
  formSubmissions?: FormSubmissionRequestDto[];
}
