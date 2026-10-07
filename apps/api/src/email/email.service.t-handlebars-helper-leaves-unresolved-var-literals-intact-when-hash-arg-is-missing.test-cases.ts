import { THandlebarsHelperTestScope } from './email.service.spec';
export function registerTHandlebarsHelperLeavesUnresolvedVarLiteralsIntactWhenHashArgIsMissing(
  scope: THandlebarsHelperTestScope,
): void {
  it('leaves unresolved {var} literals intact when hash arg is missing', async () => {
    const { service, sendMail } = scope.setupT(
      {},
      '<mjml><mj-body><mj-section><mj-column>' +
        "<mj-text>{{t 'k' 'Value: {missing}'}}</mj-text>" +
        '</mj-column></mj-section></mj-body></mjml>',
    );
    await service.sendVerificationEmail(scope.makeUser(), 'tok');
    const html = (sendMail as jest.Mock).mock.calls[0][0].html;
    expect(html).toContain('{missing}');
  });
}
