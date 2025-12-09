/* eslint-disable @typescript-eslint/no-unnecessary-type-assertion */
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { SupadminRole, BaseSupadmin } from '../entities/supadmin.entity';

export interface SupadminJwtPayload {
  supadminId: string;
  role: SupadminRole;
  permissions: Record<string, boolean>;
  iat?: number;
  exp?: number;
}

export interface SupadminRefreshPayload {
  supadminId: string;
  role: SupadminRole;
  iat?: number;
  exp?: number;
}

// Interface for JWT payload that matches @nestjs/jwt expectations
interface JwtSignPayload {
  sub: string;
  [key: string]: unknown;
}

@Injectable()
export class SupadminJwtService {
  constructor(private readonly jwtService: JwtService) {}

  signAccess(payload: {
    supadminId: string;
    role: SupadminRole;
    permissions: Record<string, boolean>;
  }): string {
    // Create payload with 'sub' field as required by JWT standard
    const jwtPayload: JwtSignPayload & Record<string, unknown> = {
      sub: payload.supadminId,
      supadminId: payload.supadminId,
      role: payload.role,
      permissions: payload.permissions,
    };
    
    return this.jwtService.sign(jwtPayload, {
      secret: process.env.JWT_SUPADMIN_ACCESS_SECRET || 'supadmin-access-secret',
      expiresIn: process.env.JWT_SUPADMIN_ACCESS_EXPIRES_IN || '15m',
    });
  }

  signRefresh(payload: {
    supadminId: string;
    role: SupadminRole;
  }): string {
    // Create payload with 'sub' field as required by JWT standard
    const jwtPayload: JwtSignPayload & Record<string, unknown> = {
      sub: payload.supadminId,
      supadminId: payload.supadminId,
      role: payload.role,
    };
    
    return this.jwtService.sign(jwtPayload, {
      secret: process.env.JWT_SUPADMIN_REFRESH_SECRET || 'supadmin-refresh-secret',
      expiresIn: process.env.JWT_SUPADMIN_REFRESH_EXPIRES_IN || '7d',
    });
  }

  verifyAccess(token: string): SupadminJwtPayload | null {
    try {
      const payload = this.jwtService.verify(token, {
        secret: process.env.JWT_SUPADMIN_ACCESS_SECRET || 'supadmin-access-secret',
      }) as Record<string, unknown>;

      const supadminId = (payload.supadminId || payload.sub) as string;
      const role = payload.role as SupadminRole;
      const permissions = (payload.permissions || {}) as Record<string, boolean>;

      if (!supadminId || !role) {
        return null;
      }

      return {
        supadminId,
        role,
        permissions,
        iat: payload.iat as number | undefined,
        exp: payload.exp as number | undefined,
      };
    } catch {
      return null;
    }
  }

  verifyRefresh(token: string): SupadminRefreshPayload | null {
    try {
      const payload = this.jwtService.verify(token, {
        secret: process.env.JWT_SUPADMIN_REFRESH_SECRET || 'supadmin-refresh-secret',
      }) as Record<string, unknown>;

      const supadminId = (payload.supadminId || payload.sub) as string;
      const role = payload.role as SupadminRole;

      if (!supadminId || !role) {
        return null;
      }

      return {
        supadminId,
        role,
        iat: payload.iat as number | undefined,
        exp: payload.exp as number | undefined,
      };
    } catch {
      return null;
    }
  }

  generateInitialTokens(supadmin: BaseSupadmin): {
    accessToken: string;
    refreshToken: string;
  } {
    const accessPayload = {
      supadminId: supadmin.id,
      role: supadmin.role,
      permissions: this.getPermissions(supadmin),
    };

    const refreshPayload = {
      supadminId: supadmin.id,
      role: supadmin.role,
    };

    return {
      accessToken: this.signAccess(accessPayload),
      refreshToken: this.signRefresh(refreshPayload),
    };
  }

  private getPermissions(supadmin: BaseSupadmin): Record<string, boolean> {
    return {
      canManagePlans: supadmin.canManagePlans || supadmin.role === SupadminRole.SUPER_ADMIN,
      canManageSellers: supadmin.canManageSellers || supadmin.role === SupadminRole.SUPER_ADMIN,
      canManageCompanies: supadmin.canManageCompanies || supadmin.role === SupadminRole.SUPER_ADMIN,
      canManageSubscriptions: supadmin.canManageSubscriptions || supadmin.role === SupadminRole.SUPER_ADMIN,
      canManagePayments: supadmin.canManagePayments || supadmin.role === SupadminRole.SUPER_ADMIN,
      canViewReports: supadmin.canViewReports || supadmin.role === SupadminRole.SUPER_ADMIN,
      canDownloadDatabase: supadmin.canDownloadDatabase || supadmin.role === SupadminRole.SUPER_ADMIN,
    };
  }
}