import { EmailTemplate, EmailTemplateTranslation, EmailTemplateType } from '@attraccess/database-entities';
import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DataSource } from 'typeorm';
import { UpdateEmailTemplateDto } from '../../../api/src/email-template/dto/update-email-template.dto';
import { EmailTemplateService } from '../../../api/src/email-template/email-template.service';
import { MjmlService } from '../../../api/src/email-template/mjml.service';
import {
  registerPluginEmailTemplates,
  unregisterPluginEmailTemplates,
} from '../../../api/src/email-template/plugin-email-templates';
import { assertRenderableTemplate } from '../../../api/src/email-template/template-syntax';
import { EMAIL_TEMPLATES } from '../backend/notifications/email/build';
import { convertMjmlDocuments, mjmlDocumentOf } from '../backend/testing/email-render.test-utils';

// The host's MjmlService runs the real mjml package (its ESM internals do not load under Jest, so the
// documents are converted in a child process), so its validation is the one production applies.
jest.mock('mjml', () => {
  const { convertMjmlDocuments: convert } = jest.requireActual('../backend/testing/email-render.test-utils');
  const mjml = async (document: string) => {
    const { html, errors } = convert([document]).get(document);
    return { html, errors: errors.map((message: string) => ({ message })) };
  };
  return Object.assign(mjml, { default: mjml });
});

const PLUGIN = 'reservations';
const keyOf = (id: string) => `plugin.${PLUGIN}.${id}` as EmailTemplateType;

/**
 * The plugin's shipped templates against the host's template store: every template is registered on boot,
 * and an admin who opens one in the editor and saves it unchanged never gets a 400.
 */
describe('reservations email templates in the host template store', () => {
  let dataSource: DataSource;
  let service: EmailTemplateService;

  beforeAll(() => {
    // One child process for all bodies instead of one per conversion.
    convertMjmlDocuments(EMAIL_TEMPLATES.map((template) => mjmlDocumentOf(template.body)));
  });

  beforeEach(async () => {
    dataSource = await new DataSource({
      type: 'sqlite',
      database: ':memory:',
      synchronize: true,
      entities: [EmailTemplate, EmailTemplateTranslation],
    }).initialize();
    service = new EmailTemplateService(
      dataSource.getRepository(EmailTemplate),
      dataSource.getRepository(EmailTemplateTranslation),
      new MjmlService(),
      { record: jest.fn().mockResolvedValue({ status: 'recorded' }) } as never,
    );
    registerPluginEmailTemplates(PLUGIN, EMAIL_TEMPLATES);
  });

  afterEach(async () => {
    unregisterPluginEmailTemplates(PLUGIN);
    await dataSource.destroy();
  });

  it('uses the real MJML validation (an unknown element is refused)', async () => {
    await expect(
      new MjmlService().validateAndConvert(mjmlDocumentOf('<mj-section><mj-bogus>x</mj-bogus></mj-section>')),
    ).rejects.toThrow(BadRequestException);
  });

  it('stores every declared template on boot (none is dropped for invalid MJML)', async () => {
    await service.onApplicationBootstrap();
    const stored = (await service.findAll())
      .map((template) => template.type)
      .filter((type) => type.startsWith('plugin.'));
    expect(stored.sort()).toEqual(EMAIL_TEMPLATES.map((template) => keyOf(template.id)).sort());
  });

  it.each(EMAIL_TEMPLATES.map((template) => [template.id]))('lets an admin save "%s" unchanged', async (id) => {
    const stored = await service.findOne(keyOf(id));
    const edit = { subject: stored.subject, body: stored.body };

    expect(await validate(plainToInstance(UpdateEmailTemplateDto, edit))).toEqual([]);
    expect(() => assertRenderableTemplate(edit)).not.toThrow();
    await expect(new MjmlService().validateAndConvert(mjmlDocumentOf(edit.body))).resolves.toContain('<body');
    await expect(service.update(keyOf(id), edit, { id: 1, authenticationMethod: 'session' })).resolves.toMatchObject(
      edit,
    );
  });
});
