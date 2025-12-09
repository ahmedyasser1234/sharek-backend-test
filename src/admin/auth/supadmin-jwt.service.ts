import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

interface SupadminPayload {
  supadminId: string;
  role: string;
  permissions: Record<string, boolean>;
  iat?: number;
  exp?: number;
  [key: string]: unknown;
}

@Injectable()
export class SupadminJwtService {
  constructor(private readonly jwtService: JwtService) {}

  signAccess(payload: SupadminPayload): string {
    return this.jwtService.sign(payload, {
      secret: process.env.SUPADMIN_JWT_SECRET || 'manager-secret-key',
      expiresIn: parseInt(process.env.SUPADMIN_JWT_EXPIRES_IN || '3600')
    });
  }

  signRefresh(payload: SupadminPayload): string {
    return this.jwtService.sign(payload, {
      secret: process.env.SUPADMIN_JWT_REFRESH_SECRET || 'supadmin-refresh-secret-key',
      expiresIn: parseInt(process.env.SUPADMIN_JWT_REFRESH_EXPIRES_IN || '604800')
    });
  }

  verify(token: string): SupadminPayload | null {
    try {
      return this.jwtService.verify<SupadminPayload>(token, {
        secret: process.env.SUPADMIN_JWT_SECRET || 'supadmin-secret-key',
      });
    } catch {
      return null;
    }
  }

  verifyRefresh(token: string): SupadminPayload | null {
    try {
      return this.jwtService.verify<SupadminPayload>(token, {
        secret: process.env.SUPADMIN_JWT_REFRESH_SECRET || 'supadmin-refresh-secret-key',
      });
    } catch {
      return null;
    }
  }
}