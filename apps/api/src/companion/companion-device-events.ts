import { UsePipes, ValidationPipe } from '@nestjs/common';
import { ConnectedSocket, MessageBody, SubscribeMessage } from '@nestjs/websockets';
import { AsyncApiPub } from 'nestjs-asyncapi';
import { CompanionAuthenticated } from './companion-authenticated.decorator';
import { CompanionGatewayRouteContext } from './companion.gateway.route-context';
import { CompanionForegroundAppDto, CompanionIdleDto, CompanionSocket, CompanionUsbDeviceDto } from './companion.types';
export abstract class CompanionDeviceEventsImplementation extends CompanionGatewayRouteContext {
  @SubscribeMessage('COMPANION_IDLE')
  @CompanionAuthenticated()
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  @AsyncApiPub({
    channel: 'COMPANION_IDLE',
    message: { name: 'COMPANION_IDLE', payload: CompanionIdleDto },
    summary: 'Companion reports that the machine has become idle',
  })
  onIdle(@MessageBody() body: CompanionIdleDto, @ConnectedSocket() socket: CompanionSocket): void {
    this.gatewayService.handleIdleEvent(socket.deviceId as number, body);
  }

  @SubscribeMessage('COMPANION_ACTIVE')
  @CompanionAuthenticated()
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  @AsyncApiPub({
    channel: 'COMPANION_ACTIVE',
    message: { name: 'COMPANION_ACTIVE', payload: CompanionIdleDto },
    summary: 'Companion reports that the machine has become active after being idle',
  })
  onActive(@MessageBody() body: CompanionIdleDto, @ConnectedSocket() socket: CompanionSocket): void {
    this.gatewayService.handleActiveEvent(socket.deviceId as number, body);
  }

  @SubscribeMessage('COMPANION_FOREGROUND_APP')
  @CompanionAuthenticated()
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  @AsyncApiPub({
    channel: 'COMPANION_FOREGROUND_APP',
    message: { name: 'COMPANION_FOREGROUND_APP', payload: CompanionForegroundAppDto },
    summary: 'Companion reports the currently focused foreground application',
  })
  onForegroundApp(@MessageBody() body: CompanionForegroundAppDto, @ConnectedSocket() socket: CompanionSocket): void {
    this.gatewayService.handleForegroundAppEvent(socket.deviceId as number, body);
  }

  @SubscribeMessage('COMPANION_USB_CONNECTED')
  @CompanionAuthenticated()
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  @AsyncApiPub({
    channel: 'COMPANION_USB_CONNECTED',
    message: { name: 'COMPANION_USB_CONNECTED', payload: CompanionUsbDeviceDto },
    summary: 'Companion reports that a USB device was connected',
  })
  onUsbConnected(@MessageBody() body: CompanionUsbDeviceDto, @ConnectedSocket() socket: CompanionSocket): void {
    this.gatewayService.handleUsbConnectedEvent(socket.deviceId as number, body);
  }

  @SubscribeMessage('COMPANION_USB_DISCONNECTED')
  @CompanionAuthenticated()
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  @AsyncApiPub({
    channel: 'COMPANION_USB_DISCONNECTED',
    message: { name: 'COMPANION_USB_DISCONNECTED', payload: CompanionUsbDeviceDto },
    summary: 'Companion reports that a USB device was disconnected',
  })
  onUsbDisconnected(@MessageBody() body: CompanionUsbDeviceDto, @ConnectedSocket() socket: CompanionSocket): void {
    this.gatewayService.handleUsbDisconnectedEvent(socket.deviceId as number, body);
  }
}
