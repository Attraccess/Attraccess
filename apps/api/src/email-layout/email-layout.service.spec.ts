import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { EmailLayoutService } from './email-layout.service';
import { SettingsStoreService } from '../settings/settings-store.service';
import { MjmlService } from '../email-template/mjml.service';

describe('EmailLayoutService', () => {
  let service: EmailLayoutService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      providers: [
        EmailLayoutService,
        {
          provide: SettingsStoreService,
          useValue: { getPlainSetting: jest.fn(), setPlainSetting: jest.fn() },
        },
        {
          provide: MjmlService,
          useValue: { validateAndConvert: jest.fn(), convertToHtml: jest.fn() },
        },
      ],
    }).compile();

    service = module.get<EmailLayoutService>(EmailLayoutService);
  });

  describe('injectContentIntoLayout', () => {
    it('should inject content into the placeholder', () => {
      const layout = '<mjml><mj-body>{{content}}</mj-body></mjml>';
      const content = '<mj-section><mj-column><mj-text>Hello</mj-text></mj-column></mj-section>';
      const result = service.injectContentIntoLayout(layout, content);
      expect(result).toContain('Hello');
      expect(result).not.toContain('{{content}}');
    });

    it('should replace all occurrences of the placeholder', () => {
      const layout = '<mjml><mj-body>{{content}}{{content}}</mj-body></mjml>';
      const content = '<mj-section></mj-section>';
      const result = service.injectContentIntoLayout(layout, content);
      expect(result.split('<mj-section></mj-section>').length - 1).toBe(2);
      expect(result).not.toContain('{{content}}');
    });

    it('should throw BadRequestException when placeholder is missing', () => {
      const layout = '<mjml><mj-body></mj-body></mjml>';
      const content = '<mj-section></mj-section>';
      expect(() => service.injectContentIntoLayout(layout, content)).toThrow(BadRequestException);
    });
  });
});
