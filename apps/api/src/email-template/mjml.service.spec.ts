// Tests for async MJML service wrapping mjml v5 Promise-based API
// FEATURE: Email template rendering with MJML

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

  describe('injectContentIntoLayout', () => {
    it('should inject content into the placeholder', () => {
      const layout = '<mjml><mj-body>{{{content}}}</mj-body></mjml>';
      const content = '<mj-section><mj-column><mj-text>Hello</mj-text></mj-column></mj-section>';
      const result = service.injectContentIntoLayout(layout, content);
      expect(result).toContain('Hello');
      expect(result).not.toContain('{{{content}}}');
    });

    it('should replace all occurrences of the placeholder', () => {
      const layout = '<mjml><mj-body>{{{content}}}{{{content}}}</mj-body></mjml>';
      const content = '<mj-section></mj-section>';
      const result = service.injectContentIntoLayout(layout, content);
      expect(result.split('<mj-section></mj-section>').length - 1).toBe(2);
      expect(result).not.toContain('{{{content}}}');
    });

    it('should throw BadRequestException when placeholder is missing', () => {
      const layout = '<mjml><mj-body></mj-body></mjml>';
      const content = '<mj-section></mj-section>';
      expect(() => service.injectContentIntoLayout(layout, content)).toThrow(BadRequestException);
    });
  });
});
