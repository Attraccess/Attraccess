import { Injectable, BadRequestException } from '@nestjs/common';
import mjml2html from 'mjml';

export interface MjmlConversionResult {
  html: string;
  hasErrors: boolean;
  error?: string;
}

@Injectable()
export class MjmlService {
  convertToHtml(mjmlContent: string): MjmlConversionResult {
    try {
      const result = mjml2html(mjmlContent);

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

  validateAndConvert(mjmlContent: string): string {
    const result = this.convertToHtml(mjmlContent);

    if (result.hasErrors) {
      throw new BadRequestException(`MJML validation failed: ${result.error}`);
    }

    return result.html;
  }
}
