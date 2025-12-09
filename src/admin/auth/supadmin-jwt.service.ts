import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

interface SupadminEntity {
  id: string;
  getPermissions(): Record<string, boolean>;
  role?: string; 
}

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

  generateInitialTokens(supadmin: SupadminEntity): { accessToken: string; refreshToken: string } {
    const permissions = supadmin.getPermissions();
    
    const role = supadmin.role ?? 'supadmin';

    const payload: SupadminPayload = {
      supadminId: supadmin.id,
      role: role,
      permissions: permissions,
    };

    return {
      accessToken: this.signAccess(payload),
      refreshToken: this.signRefresh(payload),
    };
  }

  signAccess(payload: SupadminPayload): string {
    return this.jwtService.sign(payload, {
      secret: process.env.SUPADMIN_JWT_SECRET || 'supadmin-secret-key',
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