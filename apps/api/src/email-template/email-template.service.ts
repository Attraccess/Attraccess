import { BadRequestException, Injectable, Logger, NotFoundException, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EmailTemplate, EmailTemplateTranslation, EmailTemplateType } from '@attraccess/database-entities';
import { EntityManager, Repository } from 'typeorm';
import { UpdateEmailTemplateDto } from './dto/update-email-template.dto';
import { MjmlService } from './mjml.service';
import { assertRenderableTemplate } from './template-syntax';
import { EMAIL_TEMPLATE_DEFAULTS, readDefaultTemplateBody, SHIPPED_TRANSLATIONS } from './email-defaults';
import { extractTranslationKeys, isFullMjmlDocument, TranslationKey } from '@attraccess/shared';
import {
  getPluginEmailTemplate,
  isPluginEmailTemplateKey,
  listPluginEmailTemplates,
  pluginEmailTemplatesVersion,
  type PluginEmailTemplateKey,
  type RegisteredPluginEmailTemplate,
} from './plugin-email-templates';

/** A core template type or the namespaced key of a plugin template (`plugin.<plugin>.<id>`). */
export type EmailTemplateKey = EmailTemplateType | PluginEmailTemplateKey;

/** A stored template with where it comes from: core, or the plugin that declared it. */
export type ListedEmailTemplate = EmailTemplate & {
  plugin?: { name: string; label: { en: string; de: string } };
};

export interface TemplateTranslations {
  keys: TranslationKey[];
  translations: Record<string, Record<string, string>>;
}

@Injectable()
export class EmailTemplateService implements OnApplicationBootstrap {
  private readonly logger = new Logger(EmailTemplateService.name);
  private syncedVersion = -1;
  private syncing: Promise<void> | null = null;

  constructor(
    @InjectRepository(EmailTemplate)
    private readonly emailTemplateRepository: Repository<EmailTemplate>,
    @InjectRepository(EmailTemplateTranslation)
    private readonly translationRepository: Repository<EmailTemplateTranslation>,
    private readonly mjmlService: MjmlService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.syncPluginTemplates().catch((error) =>
      this.logger.error(`Could not register plugin email templates: ${(error as Error).message}`),
    );
  }

  /** Core templates plus the templates of the plugins that are loaded now, each tagged with its origin. */
  async findAll(): Promise<ListedEmailTemplate[]> {
    await this.syncPluginTemplates();
    const rows = await this.emailTemplateRepository.find();
    // Rows of plugins that are not loaded (disabled, uninstalled) stay stored but are not offered.
    return rows
      .filter((row) => !isPluginEmailTemplateKey(row.type) || getPluginEmailTemplate(row.type))
      .map(withOrigin);
  }

  /** One template with its origin, for the editor. */
  async findOneListed(type: EmailTemplateKey): Promise<ListedEmailTemplate> {
    return withOrigin(await this.findOne(type));
  }

  async findOne(type: EmailTemplateKey, manager?: EntityManager): Promise<EmailTemplate> {
    if (isPluginEmailTemplateKey(type)) await this.syncPluginTemplates();
    const repo = manager ? manager.getRepository(EmailTemplate) : this.emailTemplateRepository;
    const template =
      isPluginEmailTemplateKey(type) && !getPluginEmailTemplate(type)
        ? null
        : await repo.findOneBy({ type: type as EmailTemplateType });
    if (!template) {
      throw new NotFoundException(`Email template "${type}" not found`);
    }
    return template;
  }

  async update(type: EmailTemplateKey, updateEmailTemplateDto: UpdateEmailTemplateDto): Promise<EmailTemplate> {
    await this.findOne(type);
    assertRenderableTemplate(updateEmailTemplateDto);

    if (updateEmailTemplateDto.body) {
      // Bodies are MJML fragments injected into the global layout at send time;
      // a full <mjml> document would nest invalidly when the email is rendered.
      if (isFullMjmlDocument(updateEmailTemplateDto.body)) {
        throw new BadRequestException('Template body must be an MJML fragment without an <mjml> root element');
      }
      await this.mjmlService.validateAndConvert(`<mjml><mj-body>${updateEmailTemplateDto.body}</mj-body></mjml>`);
    }

    await this.emailTemplateRepository.update(
      { type: type as EmailTemplateType },
      {
        body: updateEmailTemplateDto.body,
        subject: updateEmailTemplateDto.subject,
      },
    );

    return this.findOne(type);
  }

  async resetToDefault(type: EmailTemplateKey): Promise<EmailTemplate> {
    await this.findOne(type);

    const { subject, body, variables, translations } = this.defaultsFor(type);

    await this.emailTemplateRepository.update({ type: type as EmailTemplateType }, { subject, body, variables });

    await this.translationRepository.manager.transaction(async (manager) => {
      await manager.delete(EmailTemplateTranslation, { templateType: type as EmailTemplateType });
      if (translations.length > 0) {
        await manager.insert(
          EmailTemplateTranslation,
          translations.map((t) =>
            manager.create(EmailTemplateTranslation, {
              templateType: type as EmailTemplateType,
              locale: t.locale,
              key: t.key,
              value: t.value,
            }),
          ),
        );
      }
    });

    return this.findOne(type);
  }

  /** What "reset to default" restores: the bundled core default or the plugin's declaration. */
  private defaultsFor(type: EmailTemplateKey) {
    if (isPluginEmailTemplateKey(type)) {
      const declared = getPluginEmailTemplate(type) as RegisteredPluginEmailTemplate;
      return {
        subject: declared.subject,
        body: declared.body,
        variables: declared.variables,
        translations: shippedPluginTranslations(declared),
      };
    }
    const defaults = EMAIL_TEMPLATE_DEFAULTS[type];
    return {
      subject: defaults.subject,
      body: readDefaultTemplateBody(type),
      variables: defaults.variables,
      translations: SHIPPED_TRANSLATIONS.filter((t) => t.templateType === type),
    };
  }

  /**
   * Stores the templates the loaded plugins declare. Idempotent and cheap once nothing changed: it runs again only
   * when the registry changed. A template that is not stored yet is inserted with its shipped texts. A stored one
   * keeps everything an admin may have edited (subject, body, translations); only its variable list, which the editor
   * cannot change, follows the declaration, and shipped translation keys it lacks are added.
   */
  private async syncPluginTemplates(): Promise<void> {
    if (this.syncedVersion === pluginEmailTemplatesVersion()) return;
    this.syncing ??= this.runPluginSync().finally(() => {
      this.syncing = null;
    });
    await this.syncing;
  }

  private async runPluginSync(): Promise<void> {
    const version = pluginEmailTemplatesVersion();
    for (const declared of listPluginEmailTemplates()) {
      try {
        await this.mjmlService.validateAndConvert(`<mjml><mj-body>${declared.body}</mj-body></mjml>`);
        await this.syncPluginTemplate(declared);
      } catch (error) {
        this.logger.error(
          `Email template "${declared.key}" of plugin ${declared.pluginName} was not registered: ${(error as Error).message}`,
        );
      }
    }
    this.syncedVersion = version;
  }

  private async syncPluginTemplate(declared: RegisteredPluginEmailTemplate): Promise<void> {
    await this.emailTemplateRepository.manager.transaction(async (manager) => {
      const templates = manager.getRepository(EmailTemplate);
      const type = declared.key as unknown as EmailTemplateType;
      const existing = await templates.findOneBy({ type });
      if (!existing) {
        // orIgnore: a second instance seeding at the same time is a no-op instead of a conflict.
        await templates
          .createQueryBuilder()
          .insert()
          .values({ type, subject: declared.subject, body: declared.body, variables: declared.variables })
          .orIgnore()
          .execute();
      } else if (existing.variables.join(',') !== declared.variables.join(',')) {
        await templates.update({ type }, { variables: declared.variables });
      }
      const shipped = shippedPluginTranslations(declared);
      if (shipped.length > 0) {
        await manager
          .getRepository(EmailTemplateTranslation)
          .createQueryBuilder()
          .insert()
          .values(shipped.map((t) => ({ templateType: t.templateType, locale: t.locale, key: t.key, value: t.value })))
          .orIgnore()
          .execute();
      }
    });
  }

  async getExactTranslationsMap(type: EmailTemplateKey, locale: string): Promise<Record<string, string>> {
    const rows = await this.translationRepository.findBy({ templateType: type as EmailTemplateType, locale });
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  }

  async getTranslationsMap(type: EmailTemplateKey, locale: string): Promise<Record<string, string>> {
    const baseLocale = locale.split('-')[0];
    const hasRegion = baseLocale !== locale;

    if (!hasRegion) {
      return this.getExactTranslationsMap(type, locale);
    }

    // BCP-47 merge: base translations first, then regional overrides per key.
    // Skip empty regional values so they fall through to the base translation.
    const [baseRows, regionalRows] = await Promise.all([
      this.translationRepository.findBy({ templateType: type as EmailTemplateType, locale: baseLocale }),
      this.translationRepository.findBy({ templateType: type as EmailTemplateType, locale }),
    ]);
    const base = Object.fromEntries(baseRows.map((r) => [r.key, r.value]));
    for (const r of regionalRows) {
      if (r.value !== '') base[r.key] = r.value;
    }
    return base;
  }

  async getTranslations(type: EmailTemplateKey): Promise<TemplateTranslations> {
    const template = await this.findOne(type);
    const keys = extractTranslationKeys(template.subject + '\n' + template.body);
    const rows = await this.translationRepository.findBy({ templateType: type as EmailTemplateType });

    const translations: Record<string, Record<string, string>> = {};
    for (const row of rows) {
      if (!translations[row.locale]) translations[row.locale] = {};
      translations[row.locale][row.key] = row.value;
    }

    return { keys, translations };
  }

  async setTranslations(type: EmailTemplateKey, locale: string, data: Record<string, string>): Promise<void> {
    await this.findOne(type);
    const entities = Object.entries(data).map(([key, value]) =>
      this.translationRepository.create({ templateType: type as EmailTemplateType, key, locale, value }),
    );
    await this.translationRepository.manager.transaction(async (manager) => {
      await manager.delete(EmailTemplateTranslation, { templateType: type as EmailTemplateType, locale });
      if (entities.length > 0) {
        await manager.insert(EmailTemplateTranslation, entities);
      }
    });
  }

  async deleteTranslations(type: EmailTemplateKey, locale: string): Promise<void> {
    await this.findOne(type);
    await this.translationRepository.delete({ templateType: type as EmailTemplateType, locale });
  }
}

/** The translation rows a plugin template ships: its `de` texts and any other locale it declares. */
function shippedPluginTranslations(declared: RegisteredPluginEmailTemplate) {
  return Object.entries(declared.translations).flatMap(([locale, texts]) =>
    Object.entries(texts).map(([key, value]) => ({
      templateType: declared.key as unknown as EmailTemplateType,
      locale,
      key,
      value,
    })),
  );
}

function withOrigin(row: EmailTemplate): ListedEmailTemplate {
  const registered = isPluginEmailTemplateKey(row.type) ? getPluginEmailTemplate(row.type) : undefined;
  return registered ? { ...row, plugin: { name: registered.pluginName, label: registered.label } } : row;
}
