import { THandlebarsHelperTestScope } from './email.service.spec';
export function registerTHandlebarsHelperUsesDbTranslationOverDefaultAndStillInterpolatesVar(
  scope: THandlebarsHelperTestScope,
): void {
  it('uses DB translation over default and still interpolates {var}', async () => {
    const { service, sendMail } = scope.setupT({ greeting: 'Hallo {name}!' });
    await service.sendVerificationEmail(scope.makeUser({ username: 'alice', email: 'alice@example.com' }), 'tok');
    const html = (sendMail as jest.Mock).mock.calls[0][0].html;
    expect(html).toContain('Hallo alice!');
    expect(html).not.toContain('Hello alice!');
  });
}
