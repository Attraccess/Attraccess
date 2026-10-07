import { THandlebarsHelperTestScope } from './email.service.spec';
export function registerTHandlebarsHelperInterpolatesVarPlaceholdersFromHashArgsUsingTheDefaultValue(
  scope: THandlebarsHelperTestScope,
): void {
  it('interpolates {var} placeholders from hash args using the default value', async () => {
    const { service, sendMail } = scope.setupT({});
    await service.sendVerificationEmail(scope.makeUser({ username: 'alice', email: 'alice@example.com' }), 'tok');
    const html = (sendMail as jest.Mock).mock.calls[0][0].html;
    expect(html).toContain('Hello alice!');
  });
}
