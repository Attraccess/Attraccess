import { MqttClientServiceTestScope } from './mqtt-client.service.spec';
export function registerMqttClientServiceShouldBeDefined(scope: MqttClientServiceTestScope): void {
  it('should be defined', () => {
    expect(scope.service).toBeDefined();
  });
}
