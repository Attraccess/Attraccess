import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class UpdateEmailLayoutDto {
  @ApiProperty({
    description:
      'Full MJML document for the global email layout. Must contain {{content}} as a placeholder where individual template sections will be injected.',
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
