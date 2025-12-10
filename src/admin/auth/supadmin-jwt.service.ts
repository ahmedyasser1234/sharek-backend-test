import { Injectable, Logger } from '@nestjs/common';
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
  private readonly logger = new Logger(SupadminJwtService.name);
  private readonly accessSecret: string;
  private readonly refreshSecret: string;

  constructor(private readonly jwtService: JwtService) {
    this.accessSecret = process.env.SUPADMIN_JWT_SECRET || 'supadmin-secret-key';
    this.refreshSecret = process.env.SUPADMIN_JWT_REFRESH_SECRET || 'supadmin-refresh-secret-key';
    
    this.logger.log('SupadminJwtService initialized');
    this.logger.log(`Access secret length: ${this.accessSecret.length}`);
    this.logger.log(`Refresh secret length: ${this.refreshSecret.length}`);
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
      this.logger.debug(`Verifying token with secret: ${this.accessSecret.substring(0, 5)}...`);
      return this.jwtService.verify<SupadminPayload>(token, {
        secret: this.accessSecret,
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Token verification failed: ${errorMessage}`);
      return null;
    }
  }

  verifyRefresh(token: string): SupadminPayload | null {
    try {
      return this.jwtService.verify<SupadminPayload>(token, {
        secret: this.refreshSecret,
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Refresh token verification failed: ${errorMessage}`);
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