import { ShippedUsageReceiptTestScope } from './email.service.spec';
export function registerShippedUsageReceiptRendersImmutableCalculationsAndEscapedCustomContentInLocale(
  scope: ShippedUsageReceiptTestScope,
): void {
  it.each([
    {
      locale: 'en',
      labels: [
        'Session time',
        'Attributable operating time',
        'Fixed session fee',
        'Billing factor adjustment',
        'Measured: 61.001 s',
        'Measured: 60 s',
        'Billed: 2 min',
        'Billed: 1 min',
        '0.05 credits/min',
        '0.07 credits/min',
        'Applied billing factor: 80%',
      ],
    },
    {
      locale: 'de',
      labels: [
        'Sitzungszeit',
        'Zugeordnete Betriebszeit',
        'Feste Sitzungsgebühr',
        'Anpassung durch Abrechnungsfaktor',
        'Gemessen: 61,001 s',
        'Gemessen: 60 s',
        'Abgerechnet: 2 min',
        'Abgerechnet: 1 min',
        '0.05 Credits/min',
        '0.07 Credits/min',
        'Angewendeter Abrechnungsfaktor: 80%',
      ],
    },
  ] as const)('renders immutable calculations and escaped custom content in $locale', async ({ locale, labels }) => {
    const { service, sendMail, user, usage, transaction } = scope.setupReceipt(locale);

    await service.sendResourceUsageBillingSummaryEmail(user, transaction, usage, 2);

    const { html } = sendMail.mock.calls[0][0];
    for (const label of labels) expect(html).toContain(label);
    expect(html).toContain('>0.1</td>'); // 2 rounded session minutes at 0.05 credits/min.
    expect(html).toContain('0.07'); // 1 rounded operating minute at 0.07 credits/min.
    expect(html).toContain('-0.23');
    expect(html).toContain('0.94');
    expect(html).toContain('12.34');
    expect(html).toContain('Custom &lt;strong&gt;item&lt;/strong&gt;');
    expect(html).toContain('&lt;script&gt;item description&lt;/script&gt;');
    expect(html).toContain('Laser &lt;script&gt;unsafe&lt;/script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('PER_MINUTE');
    expect(html).not.toContain('PER_ATTRIBUTABLE_OPERATING_MINUTE');
    expect(html).not.toContain('999');
    expect(html).not.toContain('20%'); // Current user factor cannot alter a historical receipt.
  });
}
