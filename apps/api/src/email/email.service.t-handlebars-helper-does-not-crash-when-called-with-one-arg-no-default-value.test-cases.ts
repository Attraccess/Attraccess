import { THandlebarsHelperTestScope } from './email.service.spec';
export function registerTHandlebarsHelperDoesNotCrashWhenCalledWithOneArgNoDefaultValue(
  scope: THandlebarsHelperTestScope,
): void {
  it('does not crash when called with one arg (no defaultValue)', async () => {
    const { service, sendMail } = scope.setupT(
      {},
      '<mjml><mj-body><mj-section><mj-column>' +
        "<mj-text>{{t 'greeting'}}</mj-text>" +
        '</mj-column></mj-section></mj-body></mjml>',
    );
    await expect(service.sendVerificationEmail(scope.makeUser(), 'tok')).resolves.not.toThrow();
    const html = (sendMail as jest.Mock).mock.calls[0][0].html;
    expect(html).toBeDefined();
  });
}
