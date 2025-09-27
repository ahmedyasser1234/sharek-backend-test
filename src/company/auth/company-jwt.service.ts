import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

export interface CompanyPayload {
  companyId: string;
  role?: string;
}

@Injectable()
export class CompanyJwtService {
  private readonly logger = new Logger(CompanyJwtService.name);

  constructor(private readonly jwt: JwtService) {}

  signAccess(payload: CompanyPayload): string {
    this.logger.log(`🔐 إصدار Access Token للشركة: ${payload.companyId}`);
    return this.jwt.sign(payload, { expiresIn: '15m' });
  }

  signRefresh(payload: CompanyPayload): string {
    this.logger.log(`🔄 إصدار Refresh Token للشركة: ${payload.companyId}`);
    return this.jwt.sign(payload, { expiresIn: '7d' });
  }

  verify<T extends object = CompanyPayload>(token: string): T {
    this.logger.debug(`🔎 تحقق من التوكن بشكل متزامن`);
    return this.jwt.verify<T>(token);
  }

  async verifyAsync<T extends object = CompanyPayload>(token: string): Promise<T> {
    this.logger.debug(`🔎 تحقق من التوكن بشكل غير متزامن`);
    return this.jwt.verifyAsync<T>(token);
  }
}
