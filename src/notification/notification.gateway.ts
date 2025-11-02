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
    this.logger.log(` عميل متصل: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(` عميل منفصل: ${client.id}`);
    
    const clientData = this.connectedClients.get(client.id);
    if (clientData) {
      this.connectedClients.delete(client.id);
      
      if (clientData.type === 'admin') {
        this.logger.log(` أدمن منفصل: ${client.id}`);
      } else if (clientData.type === 'company') {
        this.logger.log(` شركة منفصلة: ${clientData.companyId} -> ${client.id}`);
      }
    }
    
    this.logConnectionStats();
  }

  @SubscribeMessage('register_admin')
  handleRegisterAdmin(client: Socket) {
    this.connectedClients.set(client.id, {
      socket: client,
      type: 'admin'
    });
    
    this.logger.log(` أدمن مسجل: ${client.id}`);
    this.logConnectionStats();
    
    client.emit('registration_success', { message: 'تم تسجيل الأدمن بنجاح' });
  }

  @SubscribeMessage('register_company')
  handleRegisterCompany(client: Socket, companyId: string) {
    this.connectedClients.set(client.id, {
      socket: client,
      type: 'company',
      companyId: companyId
    });
    
    this.logger.log(` شركة مسجلة: ${companyId} -> ${client.id}`);
    this.logConnectionStats();
    
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
    
    this.logger.log(` تم إرسال إشعار ${event} إلى ${adminCount} أدمن`);
  }

  sendToCompany(companyId: string, event: string, data: any) {
    let sent = false;
    let connectedCompanies: string[] = [];
    
    this.logger.log(` البحث عن الشركة ${companyId} بين العملاء المتصلين...`);
    
    this.connectedClients.forEach((clientData) => {
      if (clientData.type === 'company' && clientData.companyId) {
        connectedCompanies.push(clientData.companyId);
      }
    });
    
    this.logger.log(`🔍 الشركات المتصلة: ${connectedCompanies.join(', ') || 'لا يوجد'}`);
    
    this.connectedClients.forEach((clientData) => {
      if (clientData.type === 'company' && clientData.companyId === companyId) {
        this.logger.log(` وجدت الشركة ${companyId} متصلة - إرسال إشعار ${event}`);
        clientData.socket.emit(event, {
          ...data,
          timestamp: new Date(),
        });
        sent = true;
        this.logger.log(` تم إرسال إشعار ${event} إلى الشركة ${companyId}`);
      }
    });
    
    if (!sent) {
      this.logger.warn(` الشركة ${companyId} غير متصلة - سيتم تخزين الإشعار في قاعدة البيانات`);
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
    
    this.logger.log(`تم إرسال إشعار ${event} إلى ${companyCount} شركة`);
  }

  sendToClient(clientId: string, event: string, data: any) {
    const clientData = this.connectedClients.get(clientId);
    if (clientData) {
      clientData.socket.emit(event, {
        ...data,
        timestamp: new Date(),
      });
      this.logger.log(`تم إرسال إشعار ${event} إلى العميل ${clientId}`);
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

  private logConnectionStats() {
    const admins = this.getConnectedAdminsCount();
    const companies = this.getConnectedCompaniesCount();
    
    this.logger.log(` إحصائيات الاتصال - الأدمن: ${admins}, الشركات: ${companies}, الإجمالي: ${this.connectedClients.size}`);
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
    this.logger.log(`تنظيف الاتصالات - الحالي: ${this.connectedClients.size} اتصال`);
  }
}