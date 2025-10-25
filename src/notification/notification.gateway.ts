import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/admin-notifications',
})

export class NotificationGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(NotificationGateway.name);

  @WebSocketServer()
  server: Server;

  private adminSockets: Map<string, Socket> = new Map();

  handleConnection(client: Socket) {
    this.logger.log(` عميل متصل: ${client.id}`);
    
    this.adminSockets.set(client.id, client);
    
    this.logger.log(` عدد الأدمن المتصلين: ${this.adminSockets.size}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(` عميل منفصل: ${client.id}`);
    this.adminSockets.delete(client.id);
    this.logger.log(` عدد الأدمن المتصلين: ${this.adminSockets.size}`);
  }

  sendToAllAdmins(event: string, data: any) {
    this.logger.log(` إرسال إشعار ${event} لـ ${this.adminSockets.size} أدمن`);
    
    this.server.emit(event, {
      ...data,
      timestamp: new Date(),
    });
  }

  sendToAdmin(adminId: string, event: string, data: any) {
    const client = this.adminSockets.get(adminId);
    if (client) {
      client.emit(event, {
        ...data,
        timestamp: new Date(),
      });
    }
  }

  getConnectedAdminsCount(): number {
    return this.adminSockets.size;
  }
}