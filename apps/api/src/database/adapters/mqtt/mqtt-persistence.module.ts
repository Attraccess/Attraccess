import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MqttServer } from '@attraccess/database-entities';
import { MQTT_SERVER_STORE } from '../../../mqtt/mqtt-server-store.port';
import { TypeOrmMqttServerStore } from './typeorm-mqtt-server.store';

@Module({
  imports: [TypeOrmModule.forFeature([MqttServer])],
  providers: [{ provide: MQTT_SERVER_STORE, useClass: TypeOrmMqttServerStore }],
  exports: [MQTT_SERVER_STORE],
})
export class MqttPersistenceModule {}
