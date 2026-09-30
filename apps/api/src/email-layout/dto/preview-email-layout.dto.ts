import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

const PREVIEW_SAMPLE_CONTENT = `<mj-section background-color="#FFFFFF" padding="20px">
  <mj-column>
    <mj-text font-size="16px" color="#1F2937" padding="0 0 10px 0">
      Hello Example User,
    </mj-text>
    <mj-text font-size="16px" color="#1F2937" padding="0 0 20px 0">
      This is a preview of your global email layout. Individual email templates will appear here.
    </mj-text>
    <mj-button href="#" align="center">
      Example Action
    </mj-button>
    <mj-text font-size="14px" color="#6B7280" padding="20px 0 0 0">
      If you did not request this email, you can safely ignore it.
    </mj-text>
  </mj-column>
</mj-section>`;

export { PREVIEW_SAMPLE_CONTENT };

export class PreviewEmailLayoutDto {
  @ApiProperty({
    description: 'Full MJML layout body to preview. {{content}} will be replaced with sample content.',
    example: `<mjml>
  <mj-body background-color="#F3F7FB" width="600px">
    <mj-section background-color="#FFFFFF" padding="20px 0">
      <mj-column>
        <mj-text align="center" font-size="24px" color="#1E40AF" font-weight="bold" padding="0">
          My App
        </mj-text>
      </mj-column>
    </mj-section>
    {{content}}
    <mj-section background-color="#FFFFFF" padding="20px">
      <mj-column>
        <mj-text font-size="12px" color="#6B7280" align="center">Footer</mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>`,
  })
  @IsString()
  body!: string;
}
