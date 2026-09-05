// None of these host services are exercised by WAGO command properties.
export const useBillingServiceGetBillingConfiguration = () => ({ data: { minorUnit: 2 } });

function outsideFixture(): never {
  throw new Error('Host entity/currency service is outside the command fixture');
}

export const MqttServerSelect = outsideFixture;
export const CompanionDeviceSelect = outsideFixture;
export const CreateMqttServerForm = outsideFixture;
export const dbCurrencyToUserCurrency = outsideFixture;
export const userCurrencyToDbCurrency = outsideFixture;
