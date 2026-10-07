import { PartialType } from '@nestjs/swagger';
import { CreateMqttServerDto } from './create-mqtt-server.dto';

/**
 * DTO for updating an existing MQTT server
 * Extends CreateMqttServerDto but makes all properties optional
 */
export class UpdateMqttServerDto extends PartialType(CreateMqttServerDto) {}
