import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

export interface AdminPayload {
  adminId: string;
  role?: string;
}

@Injectable()
export class AdminJwtService {
  private readonly logger = new Logger(AdminJwtService.name);

  constructor(private readonly jwt: JwtService) {}

  signAccess(payload: AdminPayload): string {
    this.logger.log(`🔐 إصدار Access Token للأدمن: ${payload.adminId}`);
    return this.jwt.sign(payload, { expiresIn: '15m' });
  }

  signRefresh(payload: AdminPayload): string {
    this.logger.log(`🔄 إصدار Refresh Token للأدمن: ${payload.adminId}`);
    return this.jwt.sign(payload, { expiresIn: '7d' });
  }

  verify(token: string): AdminPayload {
    return this.jwt.verify(token);
  }
}
