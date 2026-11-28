import { ProjectChangeMode } from '@attraccess/application-models';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsInt, IsOptional, IsPositive, ValidateIf, ValidateNested } from 'class-validator';
import { FormSubmissionRequestDto } from '../../forms/dto';

export class SwitchUsageSessionProjectDto {
  @ApiProperty({
    description:
      "What the change applies to. 'whole-session' moves the running usage record, with everything used in it so far, to the new project. 'split' ends the running record under its current project and continues it in a new one for the new project.",
    enum: ProjectChangeMode,
    enumName: 'ProjectChangeMode',
    example: ProjectChangeMode.WHOLE_SESSION,
  })
  @IsEnum(ProjectChangeMode)
  mode!: ProjectChangeMode;

  @ApiProperty({
    description: 'The new project of the session, or null for no project',
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
    description:
      "Submissions of the forms required for the chosen mode: the project-reassign action for 'whole-session', project-switch for 'split'",
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
