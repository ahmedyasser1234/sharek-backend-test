import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

export interface CompanyPayload {
  companyId: string;
  role?: string;
  token?: string;
}

@Injectable()
export class CompanyJwtService {
  private readonly logger = new Logger(CompanyJwtService.name);

  constructor(private readonly jwt: JwtService) {}

  signAccess(payload: CompanyPayload): string {
    return this.jwt.sign(payload, { expiresIn: '1h' });
  }

  signRefresh(payload: CompanyPayload): string {
    return this.jwt.sign(payload, { expiresIn: '7d' });
  }

  verify<T extends object = CompanyPayload>(token: string): T {
    try {
      return this.jwt.verify<T>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  async verifyAsync<T extends object = CompanyPayload>(token: string): Promise<T> {
    try {
      return await this.jwt.verifyAsync<T>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
