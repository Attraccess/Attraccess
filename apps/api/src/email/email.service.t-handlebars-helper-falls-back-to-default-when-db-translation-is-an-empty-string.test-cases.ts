import { THandlebarsHelperTestScope } from './email.service.spec';
export function registerTHandlebarsHelperFallsBackToDefaultWhenDbTranslationIsAnEmptyString(
  scope: THandlebarsHelperTestScope,
): void {
  it('falls back to default when DB translation is an empty string', async () => {
    const { service, sendMail } = scope.setupT({ greeting: '' });
    await service.sendVerificationEmail(scope.makeUser({ username: 'alice', email: 'alice@example.com' }), 'tok');
    const html = (sendMail as jest.Mock).mock.calls[0][0].html;
    expect(html).toContain('Hello alice!');
  });
}
