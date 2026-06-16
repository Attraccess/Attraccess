import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { MjmlService } from './mjml.service';


describe('MjmlService', () => {
  let service: MjmlService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      providers: [MjmlService],
    }).compile();

    service = module.get<MjmlService>(MjmlService);
  });

  describe('convertToHtml', () => {
    it('should convert valid MJML to HTML', async () => {
      const mjml = '<mjml><mj-body><mj-section><mj-column><mj-text>Hello</mj-text></mj-column></mj-section></mj-body></mjml>';
      const result = await service.convertToHtml(mjml);

      expect(result.html).toContain('Hello');
      expect(result.html).toContain('<!doctype');
      expect(result.hasErrors).toBe(false);
      expect(result.error).toBeUndefined();
    });

    it('should return errors for invalid MJML tags', async () => {
      const mjml = '<mjml><mj-body><mj-invalid-tag>Hello</mj-invalid-tag></mj-body></mjml>';
      const result = await service.convertToHtml(mjml);

      expect(result.hasErrors).toBe(true);
      expect(result.error).toBeDefined();
    });

    it('should throw BadRequestException for completely broken input', async () => {
      await expect(service.convertToHtml(null as unknown as string)).rejects.toThrow(BadRequestException);
    });
  });

  describe('validateAndConvert', () => {
    it('should return HTML for valid MJML', async () => {
      const mjml = '<mjml><mj-body><mj-section><mj-column><mj-text>Test</mj-text></mj-column></mj-section></mj-body></mjml>';
      const html = await service.validateAndConvert(mjml);

      expect(html).toContain('Test');
      expect(typeof html).toBe('string');
    });

    it('should throw BadRequestException for MJML with validation errors', async () => {
      const mjml = '<mjml><mj-body><mj-invalid-tag>Hello</mj-invalid-tag></mj-body></mjml>';

      await expect(service.validateAndConvert(mjml)).rejects.toThrow(BadRequestException);
    });
  });
});
