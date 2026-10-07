import { defineConnectionOwnershipTests } from './mqtt-client.service.spec.define-mqtt-client-service-tests';

export type ConnectionOwnershipTestScope = ReturnType<typeof defineConnectionOwnershipTests>;
