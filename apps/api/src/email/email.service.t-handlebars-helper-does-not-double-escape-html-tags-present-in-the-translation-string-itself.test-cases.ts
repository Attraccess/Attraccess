import { THandlebarsHelperTestScope } from './email.service.spec';
export function registerTHandlebarsHelperDoesNotDoubleEscapeHtmlTagsPresentInTheTranslationStringItself(
  scope: THandlebarsHelperTestScope,
): void {
  it('does not double-escape HTML tags present in the translation string itself', async () => {
    const { service, sendMail } = scope.setupT({ greeting: '<strong>{name}</strong>' });
    await service.sendVerificationEmail(scope.makeUser({ username: 'alice' }), 'tok');
    const html = (sendMail as jest.Mock).mock.calls[0][0].html;
    expect(html).toContain('<strong>alice</strong>');
    expect(html).not.toContain('&lt;strong&gt;');
  });
}
