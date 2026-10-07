import type { ResourceFormsService } from './forms.service';
import { Form, FormField, FormSubmission, ResourceFormAction } from '@attraccess/database-entities';
import { BadRequestException } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { FormSubmissionRequestDto } from './dto';
import { MissingFormSubmissionException } from './errors/missingFormSubmission.exception';
import { parseFieldValue } from './forms.validation';
import { ResourceFormWritingImplementation } from './resource-form-writing';
export abstract class ResourceFormSubmissionsImplementation extends ResourceFormWritingImplementation {
  async validatePageAnswers(
    resourceId: number,
    formId: number,
    answers: { fieldId: number; value: unknown }[],
  ): Promise<{ valid: boolean; errors: { fieldId: number; message: string }[] }> {
    await this.ensureResourceExists(resourceId);
    const form = await this.getFormOrThrow(resourceId, formId);
    const errors: { fieldId: number; message: string }[] = [];

    for (const answer of answers) {
      const field = form.fields?.find((item) => item.id === answer.fieldId);
      if (!field) {
        errors.push({ fieldId: answer.fieldId, message: `Unknown field #${answer.fieldId}.` });
        continue;
      }
      try {
        this.validateFieldAnswer(form, field, answer.value);
      } catch (error) {
        errors.push({ fieldId: field.id, message: (error as Error).message });
      }
    }

    return { valid: errors.length === 0, errors };
  }

  async saveRequiredSubmissions(options: {
    resourceId: number;
    action: ResourceFormAction;
    submissions: FormSubmissionRequestDto[] | undefined;
    userId: number;
    resourceUsageId: number;
    manager: EntityManager;
  }): Promise<FormSubmission[]> {
    const submissions = await this.prepareRequiredSubmissions(options);
    const repository = options.manager.getRepository(FormSubmission);
    const saved: FormSubmission[] = [];
    for (const submission of submissions) saved.push(await repository.save(submission));
    return saved;
  }

  /** Validate and snapshot answers before external lifecycle effects, without publishing submissions. */
  async prepareRequiredSubmissions(
    options: Parameters<ResourceFormsService['saveRequiredSubmissions']>[0],
  ): Promise<FormSubmission[]> {
    const forms = await this.getFormsByAction(options.resourceId, options.action, options.manager);

    if (!forms.length) {
      if (options.submissions?.length) {
        this.logger.debug(
          `Received ${options.submissions.length} form submissions for action ${options.action} on resource #${options.resourceId} without required forms. Ignoring.`,
        );
      }
      return [];
    }

    const submissionEntities: FormSubmission[] = [];

    for (const form of forms) {
      const submissionsForForm = options.submissions?.filter((item) => item.formId === form.id) ?? [];

      if (submissionsForForm.length > 1) {
        throw new BadRequestException(`Multiple submissions for form "${form.name}" are not allowed.`);
      }

      const submission = submissionsForForm[0];

      if (!submission) {
        throw new MissingFormSubmissionException(form.name);
      }

      const data = this.buildSubmissionData(form, submission);

      const submissionEntity = Object.assign(new FormSubmission(), {
        formId: form.id,
        form,
        resourceUsageId: options.resourceUsageId,
        userId: options.userId,
        data,
        action: options.action,
      });

      submissionEntities.push(submissionEntity);
    }

    return submissionEntities;
  }

  protected buildSubmissionData(form: Form, submission: FormSubmissionRequestDto) {
    const data: Record<string, { value: string; fieldDefinition: FormField }> = {};

    const unknownField = submission.answers.find(
      (answer) => !form.fields?.some((field) => field.id === answer.fieldId),
    );
    if (unknownField) {
      throw new BadRequestException(
        `Answer provided for unknown field #${unknownField.fieldId} on form "${form.name}".`,
      );
    }

    for (const field of form.fields ?? []) {
      const answer = submission.answers.find((item) => item.fieldId === field.id);
      const value = this.validateFieldAnswer(form, field, answer?.value);
      if (value === undefined) {
        continue;
      }
      data[field.id.toString()] = { value, fieldDefinition: field };
    }

    return data;
  }

  protected validateFieldAnswer(form: Form, field: FormField, rawValue: unknown): string | undefined {
    if (field.type === 'boolean' && field.isRequired) {
      const boolValue = rawValue === true || rawValue === 'true';
      if (!boolValue) {
        throw new BadRequestException(`Field "${field.name}" must be checked on form "${form.name}".`);
      }
    }

    if (rawValue === undefined || rawValue === null || rawValue === '') {
      if (field.isRequired) {
        throw new BadRequestException(`Field "${field.name}" is required on form "${form.name}".`);
      }
      return undefined;
    }

    return parseFieldValue(field.type, rawValue, field.options);
  }
}
