import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

interface ManagerPayload {
  managerId: string;
  role: string;
  permissions: Record<string, boolean>;
  iat?: number;
  exp?: number;
  [key: string]: unknown;
}

@Injectable()
export class ManagerJwtService {
  constructor(private readonly jwtService: JwtService) {}

  signAccess(payload: ManagerPayload): string {
    return this.jwtService.sign(payload, {
      secret: process.env.MANAGER_JWT_SECRET || 'manager-secret-key',
      expiresIn: parseInt(process.env.MANAGER_JWT_EXPIRES_IN || '3600')
    });
  }

  signRefresh(payload: ManagerPayload): string {
    return this.jwtService.sign(payload, {
      secret: process.env.MANAGER_JWT_REFRESH_SECRET || 'manager-refresh-secret-key',
      expiresIn: parseInt(process.env.MANAGER_JWT_REFRESH_EXPIRES_IN || '604800')
    });
  }

  verify(token: string): ManagerPayload | null {
    try {
      return this.jwtService.verify<ManagerPayload>(token, {
        secret: process.env.MANAGER_JWT_SECRET || 'manager-secret-key',
      });
    } catch {
      return null;
    }
  }

  verifyRefresh(token: string): ManagerPayload | null {
    try {
      return this.jwtService.verify<ManagerPayload>(token, {
        secret: process.env.MANAGER_JWT_REFRESH_SECRET || 'manager-refresh-secret-key',
      });
    } catch {
      return null;
    }
  }
}