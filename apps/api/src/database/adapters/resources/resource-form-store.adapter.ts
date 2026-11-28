import { Inject, Injectable, Optional } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, IsNull } from 'typeorm';
import {
  Form,
  FormField,
  FormResourceOverride,
  FormSubmission,
  Resource,
  ResourceGroup,
  User,
} from '@attraccess/database-entities';
import {
  ResourceFormAction,
  effectiveFormFlags,
  type ApplicableFormRecord,
  type FormFieldRecord,
  type FormRecord,
  type FormRequiredFlags,
  type FormResourceOverrideRecord,
  type FormScope,
  type FormSubmissionListRecord,
} from '@attraccess/application-models';
import type { ResourcePersistenceContext } from '../../../resources/resource-persistence-context';
import type {
  FormAppliedResource,
  FormFieldInput,
  FormFieldUpdate,
  FormInput,
  FormListFilter,
  FormListItem,
  FormOverrideInput,
  FormUpdateResult,
  ResourceFormStore,
} from '../../../resources/forms/forms-store.port';
import { ScopedUnitOfWork, UNIT_OF_WORK } from '../../unit-of-work';
import { managerFor } from './persistence-context';

const toFieldRecord = (field: FormField): FormFieldRecord => ({
  id: field.id,
  formId: field.formId,
  name: field.name,
  type: field.type,
  isRequired: field.isRequired,
  description: field.description,
  position: field.position,
  options: field.options,
});

const toFormRecord = (form: Form): FormRecord => ({
  id: form.id,
  createdAt: form.createdAt,
  updatedAt: form.updatedAt,
  name: form.name,
  scope: form.scope,
  isRequiredOnResourceUsageStart: form.isRequiredOnResourceUsageStart,
  isRequiredOnResourceUsageTakeOver: form.isRequiredOnResourceUsageTakeOver,
  isRequiredOnResourceUsageEnd: form.isRequiredOnResourceUsageEnd,
  resourceId: form.resourceId,
  groupId: form.groupId,
  deletedAt: form.deletedAt,
  fields: [...(form.fields ?? [])].sort((a, b) => a.position - b.position || a.id - b.id).map(toFieldRecord),
});

const toOverrideRecord = (override: FormResourceOverride): FormResourceOverrideRecord => ({
  id: override.id,
  formId: override.formId,
  resourceId: override.resourceId,
  disabled: override.disabled,
  isRequiredOnResourceUsageStart: override.isRequiredOnResourceUsageStart,
  isRequiredOnResourceUsageTakeOver: override.isRequiredOnResourceUsageTakeOver,
  isRequiredOnResourceUsageEnd: override.isRequiredOnResourceUsageEnd,
  createdAt: override.createdAt,
  updatedAt: override.updatedAt,
});

const REQUIRED_FLAG = {
  [ResourceFormAction.START]: 'isRequiredOnResourceUsageStart',
  [ResourceFormAction.TAKEOVER]: 'isRequiredOnResourceUsageTakeOver',
  [ResourceFormAction.END]: 'isRequiredOnResourceUsageEnd',
} as const satisfies Record<ResourceFormAction, keyof FormRequiredFlags>;

const SCOPE_RANK: Record<FormScope, number> = { global: 0, group: 1, resource: 2 };

/**
 * SQL condition: the form row aliased `form` reaches the resource whose id is the SQL expression `resource` by its
 * scope (overrides and deletion not considered). The one place that says how resource, group and global forms apply.
 */
const formReaches = (form: string, resource: string) =>
  `(("${form}"."scope" = 'resource' AND "${form}"."resourceId" = ${resource}) OR ` +
  `("${form}"."scope" = 'group' AND EXISTS (SELECT 1 FROM "resource_groups_resource_group" "reach_rg" ` +
  `WHERE "reach_rg"."resourceGroupId" = "${form}"."groupId" AND "reach_rg"."resourceId" = ${resource})) OR ` +
  `"${form}"."scope" = 'global')`;

/** A LIKE pattern (used with a backslash ESCAPE) matching values that contain `text` literally. */
const containsPattern = (text: string) => `%${text.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;

/** Rolls the update transaction back for a field id that is not a field of the form. */
class FieldMissingRollback extends Error {
  constructor(readonly fieldId: number) {
    super(`Form field #${fieldId} not found on this form`);
  }
}

@Injectable()
export class TypeOrmResourceFormStore implements ResourceFormStore {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Optional() @Inject(UNIT_OF_WORK) private readonly unitOfWork?: ScopedUnitOfWork<EntityManager>,
  ) {}

  private manager(context?: ResourcePersistenceContext): EntityManager {
    return managerFor(context, this.dataSource.manager, this.unitOfWork);
  }

  async resourceExists(resourceId: number): Promise<boolean> {
    return (await this.dataSource.getRepository(Resource).findOne({ where: { id: resourceId } })) !== null;
  }

  async findResourceName(resourceId: number): Promise<string | null> {
    const resource = await this.dataSource
      .getRepository(Resource)
      .findOne({ where: { id: resourceId }, select: { id: true, name: true } });
    return resource?.name ?? null;
  }

  async groupExists(groupId: number): Promise<boolean> {
    return (await this.dataSource.getRepository(ResourceGroup).findOne({ where: { id: groupId } })) !== null;
  }

  async listForms(filter: FormListFilter): Promise<{ items: FormListItem[]; total: number }> {
    const query = this.dataSource
      .getRepository(Form)
      .createQueryBuilder('form')
      .leftJoinAndSelect('form.fields', 'field')
      .leftJoinAndSelect('form.resource', 'resource')
      .leftJoinAndSelect('form.group', 'group')
      .where('form.deletedAt IS NULL')
      // A resource form of a deleted resource is inert: it applies nowhere and cannot be saved any more. (The join
      // already leaves deleted resources out.)
      .andWhere(`(form.scope != 'resource' OR (resource.id IS NOT NULL AND resource.deletedAt IS NULL))`);
    if (filter.scope) query.andWhere('form.scope = :scope', { scope: filter.scope });
    if (filter.resourceId !== undefined)
      query.andWhere('form.resourceId = :resourceId', { resourceId: filter.resourceId });
    if (filter.groupId !== undefined) query.andWhere('form.groupId = :groupId', { groupId: filter.groupId });
    if (filter.search?.trim()) {
      query.andWhere(`LOWER(form.name) LIKE :search ESCAPE '\\'`, {
        search: containsPattern(filter.search.trim().toLowerCase()),
      });
    }
    const [forms, total] = await query
      .orderBy('form.name', 'ASC')
      .addOrderBy('form.id', 'ASC')
      .skip((filter.page - 1) * filter.limit)
      .take(filter.limit)
      .getManyAndCount();

    const counts = await this.countAppliedResources(forms);
    return {
      total,
      items: forms.map((form) => ({
        form: toFormRecord(form),
        appliesToResourceCount: counts.get(form.id) ?? 0,
        resourceName: form.resource?.name ?? null,
        groupName: form.group?.name ?? null,
      })),
    };
  }

  async findForm(formId: number, context?: ResourcePersistenceContext): Promise<FormRecord | null> {
    const form = await this.manager(context)
      .getRepository(Form)
      .findOne({ where: { id: formId, deletedAt: IsNull() }, relations: { fields: true } });
    return form ? toFormRecord(form) : null;
  }

  async findFormIncludingDeleted(formId: number): Promise<FormRecord | null> {
    const form = await this.dataSource
      .getRepository(Form)
      .findOne({ where: { id: formId }, relations: { fields: true } });
    return form ? toFormRecord(form) : null;
  }

  async findApplicableForResource(
    resourceId: number,
    context?: ResourcePersistenceContext,
  ): Promise<ApplicableFormRecord[]> {
    const manager = this.manager(context);
    const forms = await manager
      .getRepository(Form)
      .createQueryBuilder('form')
      .leftJoinAndSelect('form.fields', 'field')
      .leftJoinAndSelect('form.group', 'group')
      .where('form.deletedAt IS NULL')
      .andWhere(formReaches('form', ':resourceId'), { resourceId })
      .getMany();
    if (!forms.length) return [];

    const overrides = await manager
      .getRepository(FormResourceOverride)
      .find({ where: { resourceId, formId: In(forms.map((form) => form.id)) } });
    const overrideByForm = new Map(overrides.map((override) => [override.formId, toOverrideRecord(override)]));

    return forms
      .sort((a, b) => SCOPE_RANK[a.scope] - SCOPE_RANK[b.scope] || a.id - b.id)
      .map((form) => {
        const record = toFormRecord(form);
        const override = overrideByForm.get(form.id) ?? null;
        return {
          form: record,
          groupName: form.scope === 'group' ? (form.group?.name ?? null) : null,
          override,
          disabled: override?.disabled ?? false,
          effective: effectiveFormFlags(record, override),
        };
      });
  }

  async findRequiredForAction(
    resourceId: number,
    action: ResourceFormAction,
    context?: ResourcePersistenceContext,
  ): Promise<FormRecord[]> {
    const flag = REQUIRED_FLAG[action];
    return (await this.findApplicableForResource(resourceId, context))
      .filter((applicable) => !applicable.disabled && applicable.effective[flag])
      .map((applicable) => applicable.form);
  }

  async listAppliedResources(formId: number): Promise<FormAppliedResource[]> {
    const form = await this.dataSource.getRepository(Form).findOne({ where: { id: formId, deletedAt: IsNull() } });
    if (!form) return [];
    const resources = await this.dataSource
      .getRepository(Resource)
      .createQueryBuilder('resource')
      .select(['resource.id', 'resource.name'])
      .where(`EXISTS (SELECT 1 FROM "form" "f" WHERE "f"."id" = :formId AND ${formReaches('f', '"resource"."id"')})`, {
        formId,
      })
      .orderBy('resource.name', 'ASC')
      .addOrderBy('resource.id', 'ASC')
      .getMany();
    const overrides = await this.dataSource.getRepository(FormResourceOverride).find({ where: { formId } });
    const overrideByResource = new Map(overrides.map((override) => [override.resourceId, toOverrideRecord(override)]));
    return resources.map((resource) => ({
      resource: { id: resource.id, name: resource.name },
      override: overrideByResource.get(resource.id) ?? null,
    }));
  }

  async createForm(form: FormInput, fields: FormFieldInput[]): Promise<FormRecord> {
    const createdId = await this.dataSource.transaction(async (manager) => {
      const formRepo = manager.getRepository(Form);
      const saved = await formRepo.save(formRepo.create(this.formColumns(form)));
      if (fields.length) {
        const fieldRepo = manager.getRepository(FormField);
        await fieldRepo.save(fields.map((field) => fieldRepo.create({ ...field, formId: saved.id })));
      }
      return saved.id;
    });
    return this.reload(createdId);
  }

  async updateForm(formId: number, form: FormInput, fields: FormFieldUpdate[]): Promise<FormUpdateResult> {
    try {
      const found = await this.dataSource.transaction(async (manager) => {
        const formRepo = manager.getRepository(Form);
        const fieldRepo = manager.getRepository(FormField);
        if (!(await formRepo.findOne({ where: { id: formId, deletedAt: IsNull() } }))) return false;

        await formRepo.update({ id: formId }, this.formColumns(form));

        const incomingIds = fields.map((field) => field.id).filter((id): id is number => !!id);
        const existing = await fieldRepo.find({ where: { formId } });
        const idsToDelete = existing.map((field) => field.id).filter((id) => !incomingIds.includes(id));
        if (idsToDelete.length) await fieldRepo.delete(idsToDelete);

        for (const { id, ...payload } of fields) {
          if (!id) {
            await fieldRepo.insert({ ...payload, formId });
          } else if (existing.some((field) => field.id === id)) {
            await fieldRepo.update(id, payload);
          } else {
            throw new FieldMissingRollback(id);
          }
        }

        await this.deleteOverridesOutsideScope(manager, formId);
        return true;
      });
      if (!found) return { status: 'form-missing' };
    } catch (error) {
      if (error instanceof FieldMissingRollback) return { status: 'field-missing', fieldId: error.fieldId };
      throw error;
    }
    return { status: 'updated', form: await this.reload(formId) };
  }

  async deleteForm(formId: number): Promise<boolean> {
    const result = await this.dataSource
      .getRepository(Form)
      .update({ id: formId, deletedAt: IsNull() }, { deletedAt: new Date() });
    return (result.affected ?? 0) > 0;
  }

  async softDeleteGroupForms(groupId: number, context?: ResourcePersistenceContext): Promise<number> {
    const result = await this.manager(context)
      .getRepository(Form)
      .update({ groupId, scope: 'group', deletedAt: IsNull() }, { deletedAt: new Date() });
    return result.affected ?? 0;
  }

  async upsertOverride(
    formId: number,
    resourceId: number,
    input: FormOverrideInput,
  ): Promise<FormResourceOverrideRecord | null> {
    // Checked and written in one unit of work, so a concurrent scope move cannot leave an override outside the form's
    // scope. The application's unit of work also serializes concurrent writes of the same override.
    const write = async (manager: EntityManager) => {
      const reaches = await manager
        .getRepository(Form)
        .createQueryBuilder('form')
        .where('form.id = :formId', { formId })
        .andWhere('form.deletedAt IS NULL')
        .andWhere(formReaches('form', ':resourceId'), { resourceId })
        .getExists();
      if (!reaches) return null;
      const repo = manager.getRepository(FormResourceOverride);
      // SQLite upserts leave @UpdateDateColumn out of ON CONFLICT DO UPDATE, so set it explicitly.
      await repo.upsert({ formId, resourceId, ...input, updatedAt: new Date() }, ['formId', 'resourceId']);
      return toOverrideRecord(await repo.findOneByOrFail({ formId, resourceId }));
    };
    const unitOfWork = this.unitOfWork;
    if (unitOfWork) return unitOfWork.run((scope) => write(unitOfWork.handleOf(scope)));
    return this.dataSource.transaction(write);
  }

  async deleteOverride(formId: number, resourceId: number): Promise<boolean> {
    const result = await this.dataSource.getRepository(FormResourceOverride).delete({ formId, resourceId });
    return (result.affected ?? 0) > 0;
  }

  async listSubmissions(
    formId: number,
    filter: { resourceId?: number; page: number; limit: number },
  ): Promise<{ items: FormSubmissionListRecord[]; total: number }> {
    const query = this.dataSource
      .getRepository(FormSubmission)
      .createQueryBuilder('submission')
      .leftJoin('submission.resourceUsage', 'usage')
      .addSelect(['usage.id', 'usage.resourceId'])
      .withDeleted()
      .where('submission.formId = :formId', { formId });
    if (filter.resourceId !== undefined) {
      query.andWhere('usage.resourceId = :resourceId', { resourceId: filter.resourceId });
    }
    // Every join is many-to-one, so plain OFFSET/LIMIT pages correctly in one query, served by the
    // (formId, createdAt) index instead of TypeORM's DISTINCT sub-select for skip/take.
    const submissions = await query
      .orderBy('submission.createdAt', 'DESC')
      .addOrderBy('submission.id', 'DESC')
      .offset((filter.page - 1) * filter.limit)
      .limit(filter.limit)
      .getMany();
    const total =
      filter.resourceId === undefined
        ? await this.dataSource.getRepository(FormSubmission).countBy({ formId })
        : await query.clone().orderBy().offset(undefined).limit(undefined).getCount();

    // Read separately: a join leaves deleted users and resources out, but they keep their names in the history.
    const idsOf = (values: (number | undefined)[]) =>
      [...new Set(values)].filter((id): id is number => typeof id === 'number');
    const resourceIds = idsOf(submissions.map((submission) => submission.resourceUsage?.resourceId));
    const userIds = idsOf(submissions.map((submission) => submission.userId));
    const [resources, users] = await Promise.all([
      resourceIds.length
        ? this.dataSource
            .getRepository(Resource)
            .find({ where: { id: In(resourceIds) }, select: { id: true, name: true }, withDeleted: true })
        : Promise.resolve<Resource[]>([]),
      userIds.length
        ? this.dataSource.getRepository(User).find({
            where: { id: In(userIds) },
            select: { id: true, username: true, firstName: true, lastName: true },
            withDeleted: true,
          })
        : Promise.resolve<User[]>([]),
    ]);
    const resourceById = new Map(resources.map((resource) => [resource.id, resource]));
    const userById = new Map(users.map((user) => [user.id, user]));

    return {
      total,
      items: submissions.map((submission) => {
        const resource = resourceById.get(submission.resourceUsage?.resourceId ?? -1);
        const user = userById.get(submission.userId);
        return {
          id: submission.id,
          createdAt: submission.createdAt,
          formId: submission.formId,
          action: submission.action,
          user: user
            ? { id: user.id, username: user.username, firstName: user.firstName, lastName: user.lastName }
            : null,
          resource: resource ? { id: resource.id, name: resource.name } : null,
          data: submission.data as unknown as FormSubmissionListRecord['data'],
        };
      }),
    };
  }

  /** Per form, the resources (not deleted) its scope reaches that have not switched it off, in one query. */
  private async countAppliedResources(forms: Form[]): Promise<Map<number, number>> {
    if (!forms.length) return new Map();
    const rows: { formId: number; count: number | string }[] = await this.dataSource
      .createQueryBuilder()
      .select('"f"."id"', 'formId')
      .addSelect('COUNT("r"."id")', 'count')
      .from(Form, 'f')
      .innerJoin(Resource, 'r', `"r"."deletedAt" IS NULL AND ${formReaches('f', '"r"."id"')}`)
      .where('"f"."id" IN (:...formIds)', { formIds: forms.map((form) => form.id) })
      .andWhere(
        `NOT EXISTS (SELECT 1 FROM "form_resource_override" "o" WHERE "o"."formId" = "f"."id" ` +
          `AND "o"."resourceId" = "r"."id" AND "o"."disabled" = :disabled)`,
        { disabled: true },
      )
      .groupBy('"f"."id"')
      .getRawMany();
    return new Map(rows.map((row) => [Number(row.formId), Number(row.count)]));
  }

  /** Deletes the form's overrides of resources its (already saved) scope no longer reaches. */
  private async deleteOverridesOutsideScope(manager: EntityManager, formId: number) {
    await manager
      .createQueryBuilder()
      .delete()
      .from(FormResourceOverride)
      .where('"formId" = :formId', { formId })
      .andWhere(
        `NOT EXISTS (SELECT 1 FROM "form" "f" WHERE "f"."id" = :formId AND ` +
          `${formReaches('f', '"form_resource_override"."resourceId"')})`,
      )
      .execute();
  }

  private formColumns(form: FormInput) {
    return {
      name: form.name,
      scope: form.scope,
      resourceId: form.scope === 'resource' ? form.resourceId : null,
      groupId: form.scope === 'group' ? form.groupId : null,
      isRequiredOnResourceUsageStart: form.isRequiredOnResourceUsageStart,
      isRequiredOnResourceUsageTakeOver: form.isRequiredOnResourceUsageTakeOver,
      isRequiredOnResourceUsageEnd: form.isRequiredOnResourceUsageEnd,
    };
  }

  private async reload(formId: number): Promise<FormRecord> {
    const form = await this.dataSource
      .getRepository(Form)
      .findOneOrFail({ where: { id: formId }, relations: { fields: true } });
    return toFormRecord(form);
  }
}
