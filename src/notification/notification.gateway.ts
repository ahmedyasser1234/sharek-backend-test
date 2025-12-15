import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

interface ConnectedClient {
  socket: Socket;
  type: 'admin' | 'company';
  companyId?: string;
}

@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/notifications',
})
export class NotificationGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(NotificationGateway.name);

  @WebSocketServer()
  server: Server;

  private connectedClients: Map<string, ConnectedClient> = new Map();

  handleConnection(client: Socket) {
    // لا توجد رسائل لوج هنا
  }

  handleDisconnect(client: Socket) {
    const clientData = this.connectedClients.get(client.id);
    if (clientData) {
      this.connectedClients.delete(client.id);
    }
  }

  @SubscribeMessage('register_admin')
  handleRegisterAdmin(client: Socket) {
    this.connectedClients.set(client.id, {
      socket: client,
      type: 'admin'
    });
    
    client.emit('registration_success', { message: 'تم تسجيل الأدمن بنجاح' });
  }

  @SubscribeMessage('register_company')
  handleRegisterCompany(client: Socket, companyId: string) {
    this.connectedClients.set(client.id, {
      socket: client,
      type: 'company',
      companyId: companyId
    });
    
    client.emit('registration_success', { message: 'تم تسجيل الشركة بنجاح' });
  }

  sendToAllAdmins(event: string, data: any) {
    let adminCount = 0;
    
    this.connectedClients.forEach((clientData) => {
      if (clientData.type === 'admin') {
        clientData.socket.emit(event, {
          ...data,
          timestamp: new Date(),
        });
        adminCount++;
      }
    });
  }

  sendToCompany(companyId: string, event: string, data: any) {
    let sent = false;
    
    this.connectedClients.forEach((clientData) => {
      if (clientData.type === 'company' && clientData.companyId === companyId) {
        clientData.socket.emit(event, {
          ...data,
          timestamp: new Date(),
        });
        sent = true;
      }
    });
    
    if (!sent) {
      this.logger.error(`الشركة ${companyId} غير متصلة - سيتم تخزين الإشعار في قاعدة البيانات`);
    }
    
    return sent;
  }

  sendToAllCompanies(event: string, data: any) {
    let companyCount = 0;
    
    this.connectedClients.forEach((clientData) => {
      if (clientData.type === 'company') {
        clientData.socket.emit(event, {
          ...data,
          timestamp: new Date(),
        });
        companyCount++;
      }
    });
  }

  sendToClient(clientId: string, event: string, data: any) {
    const clientData = this.connectedClients.get(clientId);
    if (clientData) {
      clientData.socket.emit(event, {
        ...data,
        timestamp: new Date(),
      });
    }
  }

  getConnectedAdminsCount(): number {
    let count = 0;
    this.connectedClients.forEach(clientData => {
      if (clientData.type === 'admin') count++;
    });
    return count;
  }

  getConnectedCompaniesCount(): number {
    let count = 0;
    this.connectedClients.forEach(clientData => {
      if (clientData.type === 'company') count++;
    });
    return count;
  }

  getCompanySocketId(companyId: string): string | null {
    for (const [socketId, clientData] of this.connectedClients.entries()) {
      if (clientData.type === 'company' && clientData.companyId === companyId) {
        return socketId;
      }
    }
    return null;
  }

  isCompanyConnected(companyId: string): boolean {
    return this.getCompanySocketId(companyId) !== null;
  }

  isAdminConnected(clientId: string): boolean {
    const clientData = this.connectedClients.get(clientId);
    return clientData?.type === 'admin';
  }

  getConnectedCompanies(): string[] {
    const companies: string[] = [];
    this.connectedClients.forEach(clientData => {
      if (clientData.type === 'company' && clientData.companyId) {
        companies.push(clientData.companyId);
      }
    });
    return companies;
  }

  cleanupOldConnections() {
    // لا توجد رسائل لوج هنا
  }
}