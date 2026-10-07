import { THandlebarsHelperTestScope } from './email.service.spec';
export function registerTHandlebarsHelperEscapesHtmlDangerousCharactersInInterpolatedValues(
  scope: THandlebarsHelperTestScope,
): void {
  it('escapes HTML-dangerous characters in interpolated values', async () => {
    const { service, sendMail } = scope.setupT({});
    await service.sendVerificationEmail(scope.makeUser({ username: '<script>alert(1)</script>' }), 'tok');
    const html = (sendMail as jest.Mock).mock.calls[0][0].html;
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
}
