// Async MJML-to-HTML conversion service wrapping mjml v5 async API
// FEATURE: Email template rendering with MJML

import { Injectable, BadRequestException } from '@nestjs/common';
import mjml2html from 'mjml';

export interface MjmlConversionResult {
  html: string;
  hasErrors: boolean;
  error?: string;
}

@Injectable()
export class MjmlService {
  async convertToHtml(mjmlContent: string): Promise<MjmlConversionResult> {
    try {
      const result = await mjml2html(mjmlContent);

      if (result.errors?.length > 0) {
        return {
          html: result.html,
          hasErrors: true,
          error: result.errors.map((err) => err.message).join(', '),
        };
      }

      return {
        html: result.html,
        hasErrors: false,
      };
    } catch (error) {
      throw new BadRequestException(`Invalid MJML content: ${error.message}`);
    }
  }

  async validateAndConvert(mjmlContent: string): Promise<string> {
    const result = await this.convertToHtml(mjmlContent);

    if (result.hasErrors) {
      throw new BadRequestException(`MJML validation failed: ${result.error}`);
    }

    return result.html;
  }

  injectContentIntoLayout(layoutMjml: string, contentMjml: string): string {
    const placeholder = '{{{content}}}';
    if (!layoutMjml.includes(placeholder)) {
      throw new BadRequestException(`Email layout is missing the required placeholder: ${placeholder}`);
    }
    return layoutMjml.split(placeholder).join(contentMjml);
  }
}
