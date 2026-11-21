import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { EmailTemplateRecord, EmailTemplateTranslationRecord, EmailTemplateType } from '@attraccess/application-models';
import { EMAIL_TEMPLATE_STORE, EmailTemplateReadContext, EmailTemplateStore } from './email-template-store.port';
import { UpdateEmailTemplateDto } from './dto/update-email-template.dto';
import { MjmlService } from './mjml.service';
import { auditSubjectKeyId } from '../audit/policies/administration';
import { AUDIT_RECORDER, AuditActor, AuditDetails, AuditRecorder } from '../audit/recorder/audit-event';
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
export type ListedEmailTemplate = EmailTemplateRecord & {
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
  private syncing: Promise<number> | null = null;

  constructor(
    @Inject(EMAIL_TEMPLATE_STORE) private readonly store: EmailTemplateStore,
    private readonly mjmlService: MjmlService,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.syncPluginTemplates().catch((error) =>
      this.logger.error(`Could not register plugin email templates: ${(error as Error).message}`),
    );
  }

  /** Core templates plus the templates of the plugins that are loaded now, each tagged with its origin. */
  async findAll(): Promise<ListedEmailTemplate[]> {
    await this.syncPluginTemplates();
    const rows = await this.store.listTemplates();
    // Rows of plugins that are not loaded (disabled, uninstalled) stay stored but are not offered.
    return rows
      .filter((row) => !isPluginEmailTemplateKey(row.type) || getPluginEmailTemplate(row.type))
      .map(withOrigin);
  }

  /** One template with its origin, for the editor. */
  async findOneListed(type: EmailTemplateKey): Promise<ListedEmailTemplate> {
    return withOrigin(await this.findOne(type));
  }

  async findOne(type: EmailTemplateKey, transaction?: EmailTemplateReadContext): Promise<EmailTemplateRecord> {
    if (isPluginEmailTemplateKey(type)) await this.syncPluginTemplates();
    const template =
      isPluginEmailTemplateKey(type) && !getPluginEmailTemplate(type)
        ? null
        : await this.store.findTemplate(type, transaction);
    if (!template) {
      throw new NotFoundException(`Email template "${type}" not found`);
    }
    return template;
  }

  async update(
    type: EmailTemplateKey,
    updateEmailTemplateDto: UpdateEmailTemplateDto,
    actor: AuditActor,
  ): Promise<EmailTemplateRecord> {
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

    await this.store.updateContent(type, {
      body: updateEmailTemplateDto.body,
      subject: updateEmailTemplateDto.subject,
    });

    const template = await this.findOne(type);
    await this.record(actor, 'email_template.updated', type, { templateType: type });
    return template;
  }

  async resetToDefault(type: EmailTemplateKey, actor: AuditActor): Promise<EmailTemplateRecord> {
    await this.findOne(type);

    const { subject, body, variables, translations } = this.defaultsFor(type);

    await this.store.restoreDefaults(
      type,
      { subject, body, variables },
      translations.map((t) => ({
        templateType: type as EmailTemplateType,
        locale: t.locale,
        key: t.key,
        value: t.value,
      })),
    );

    const template = await this.findOne(type);
    await this.record(actor, 'email_template.reset', type, { templateType: type });
    return template;
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
    // Only a known core type may name a bundled file: the key comes from the URL and must never reach a path.
    const coreType = Object.values(EmailTemplateType).find((known) => known === type);
    if (!coreType) throw new NotFoundException(`Email template "${type}" not found`);
    const defaults = EMAIL_TEMPLATE_DEFAULTS[coreType];
    return {
      subject: defaults.subject,
      body: readDefaultTemplateBody(coreType),
      variables: defaults.variables,
      translations: SHIPPED_TRANSLATIONS.filter((t) => t.templateType === coreType),
    };
  }

  /**
   * Stores the templates the loaded plugins declare. Idempotent and cheap once nothing changed: it runs again only
   * when the registry changed, or when storing a template failed last time. A template that is not stored yet is
   * inserted with its shipped texts and translations. From then on it belongs to the admins: subject, body and
   * translations stay as they are (also when a plugin update ships new defaults; "reset to default" restores them),
   * only its variable list, which the editor cannot change, follows the declaration, and a body still equal to one
   * the plugin lists in `previousBodies` (never edited) moves to the declared body.
   */
  private async syncPluginTemplates(): Promise<void> {
    for (;;) {
      if (this.syncedVersion === pluginEmailTemplatesVersion()) return;
      this.syncing ??= this.runPluginSync().finally(() => {
        this.syncing = null;
      });
      const attempted = await this.syncing;
      // A sync that started before the registry changed again is stale: run another one. A failed sync of the
      // current version is retried by the next caller, not in a loop here.
      if (attempted === pluginEmailTemplatesVersion()) return;
    }
  }

  /** @returns the registry version it synced; `syncedVersion` advances only when every template was stored. */
  private async runPluginSync(): Promise<number> {
    const version = pluginEmailTemplatesVersion();
    let stored = true;
    for (const declared of listPluginEmailTemplates()) {
      const where = `Email template "${declared.key}" of plugin ${declared.pluginName}`;
      try {
        await this.mjmlService.validateAndConvert(`<mjml><mj-body>${declared.body}</mj-body></mjml>`);
      } catch (error) {
        // Invalid MJML stays invalid until the plugin changes, which changes the registry version: no retry.
        this.logger.error(`${where} was not registered: ${(error as Error).message}`);
        continue;
      }
      try {
        await this.syncPluginTemplate(declared);
      } catch (error) {
        stored = false;
        this.logger.error(`${where} could not be stored, retrying on next use: ${(error as Error).message}`);
      }
    }
    if (stored) this.syncedVersion = version;
    return version;
  }

  private async syncPluginTemplate(declared: RegisteredPluginEmailTemplate): Promise<void> {
    await this.store.registerPluginTemplate(
      {
        type: declared.key,
        subject: declared.subject,
        body: declared.body,
        variables: declared.variables,
        previousBodies: declared.previousBodies,
      },
      shippedPluginTranslations(declared),
    );
  }

  async getExactTranslationsMap(type: EmailTemplateKey, locale: string): Promise<Record<string, string>> {
    const rows = await this.store.findTranslations(type, locale);
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
      this.store.findTranslations(type, baseLocale),
      this.store.findTranslations(type, locale),
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
    const rows = await this.store.findTranslations(type);

    const translations: Record<string, Record<string, string>> = {};
    for (const row of rows) {
      if (!translations[row.locale]) translations[row.locale] = {};
      translations[row.locale][row.key] = row.value;
    }

    return { keys, translations };
  }

  async setTranslations(
    type: EmailTemplateKey,
    locale: string,
    data: Record<string, string>,
    actor: AuditActor,
  ): Promise<void> {
    await this.findOne(type);
    const entries = Object.entries(data).map(([key, value]) => ({ key, value }));
    await this.store.replaceTranslations(type, locale, entries, async (transaction) => {
      const details = { templateType: type, locale, translationCount: Object.keys(data).length };
      await this.record(actor, 'email_template.translations_set', type, details, transaction);
    });
  }

  async deleteTranslations(type: EmailTemplateKey, locale: string, actor: AuditActor): Promise<void> {
    await this.findOne(type);
    await this.store.deleteTranslations(type, locale);
    await this.record(actor, 'email_template.translations_deleted', type, { templateType: type, locale });
  }

  private async record(
    actor: AuditActor,
    action: `email_template.${'updated' | 'reset' | 'translations_set' | 'translations_deleted'}`,
    type: string,
    details: AuditDetails,
    transaction?: EmailTemplateReadContext,
  ) {
    await this.audit.record(
      {
        domain: 'administration',
        action,
        actor,
        subject: { type: 'email-template', id: auditSubjectKeyId(type) },
        details,
      },
      // The audit row joins the caller's transaction, whatever handle type the recorder takes.
      transaction as Parameters<AuditRecorder['record']>[1],
    );
  }
}

/** The translation rows a plugin template ships: its `de` texts and any other locale it declares. */
function shippedPluginTranslations(declared: RegisteredPluginEmailTemplate): EmailTemplateTranslationRecord[] {
  return Object.entries(declared.translations).flatMap(([locale, texts]) =>
    Object.entries(texts).map(([key, value]) => ({
      templateType: declared.key as unknown as EmailTemplateType,
      locale,
      key,
      value,
    })),
  );
}

function withOrigin(row: EmailTemplateRecord): ListedEmailTemplate {
  const registered = isPluginEmailTemplateKey(row.type) ? getPluginEmailTemplate(row.type) : undefined;
  return registered ? { ...row, plugin: { name: registered.pluginName, label: registered.label } } : row;
}
