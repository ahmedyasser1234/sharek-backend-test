import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Supadmin } from '../entities/supadmin.entity';

interface SupadminPayload {
  supadminId: string;
  role: string;
  permissions: Record<string, boolean>;
  iat?: number;
  exp?: number;
  email?: string;
  [key: string]: unknown;
}

@Injectable()
export class SupadminJwtService {
  private readonly accessSecret: string;
  private readonly refreshSecret: string;

  constructor(private readonly jwtService: JwtService) {
    this.accessSecret = process.env.SUPADMIN_JWT_SECRET || 'supadmin-secret-key';
    this.refreshSecret = process.env.SUPADMIN_JWT_REFRESH_SECRET || 'supadmin-refresh-secret-key';
  }

  generateInitialTokens(supadmin: Supadmin): { 
    accessToken: string; 
    refreshToken: string; 
  } {
    const permissions = supadmin.getPermissions();
    
    const payload: SupadminPayload = {
      supadminId: supadmin.id,
      role: supadmin.role,
      permissions: permissions,
      email: supadmin.email,
    };

    const accessToken = this.jwtService.sign(payload, {
      secret: this.accessSecret,
      expiresIn: parseInt(process.env.SUPADMIN_JWT_EXPIRES_IN || '3600')
    });

    const refreshToken = this.jwtService.sign(payload, {
      secret: this.refreshSecret,
      expiresIn: parseInt(process.env.SUPADMIN_JWT_REFRESH_EXPIRES_IN || '604800')
    });

    return {
      accessToken,
      refreshToken,
    };
  }

  verify(token: string): SupadminPayload | null {
    try {
      return this.jwtService.verify<SupadminPayload>(token, {
        secret: this.accessSecret,
      });
    } catch {
      return null;
    }
  }

  verifyRefresh(token: string): SupadminPayload | null {
    try {
      return this.jwtService.verify<SupadminPayload>(token, {
        secret: this.refreshSecret,
      });
    } catch {
      return null;
    }
  }

  signAccess(payload: SupadminPayload): string {
    return this.jwtService.sign(payload, {
      secret: this.accessSecret,
      expiresIn: parseInt(process.env.SUPADMIN_JWT_EXPIRES_IN || '3600')
    });
  }

  signRefresh(payload: SupadminPayload): string {
    return this.jwtService.sign(payload, {
      secret: this.refreshSecret,
      expiresIn: parseInt(process.env.SUPADMIN_JWT_REFRESH_EXPIRES_IN || '604800')
    });
  }
}