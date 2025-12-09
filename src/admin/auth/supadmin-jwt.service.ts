import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { SupadminRole, BaseSupadmin } from '../entities/supadmin.entity';

// تعريف واجهة الحمولة (payload)
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

@Injectable()
export class SupadminJwtService {
  constructor(private readonly jwtService: JwtService) {}

  signAccess(payload: {
    supadminId: string;
    role: SupadminRole;
    permissions: Record<string, boolean>;
  }): string {
    return this.jwtService.sign(payload, {
      secret: process.env.JWT_SUPADMIN_ACCESS_SECRET || 'supadmin-access-secret',
      expiresIn: process.env.JWT_SUPADMIN_ACCESS_EXPIRES_IN || '15m',
    });
  }

  signRefresh(payload: {
    supadminId: string;
    role: SupadminRole;
  }): string {
    return this.jwtService.sign(payload, {
      secret: process.env.JWT_SUPADMIN_REFRESH_SECRET || 'supadmin-refresh-secret',
      expiresIn: process.env.JWT_SUPADMIN_REFRESH_EXPIRES_IN || '7d',
    });
  }

  verifyAccess(token: string): SupadminJwtPayload | null {
    try {
      return this.jwtService.verify<SupadminJwtPayload>(token, {
        secret: process.env.JWT_SUPADMIN_ACCESS_SECRET || 'supadmin-access-secret',
      });
    } catch {
      return null;
    }
  }

  verifyRefresh(token: string): SupadminRefreshPayload | null {
    try {
      return this.jwtService.verify<SupadminRefreshPayload>(token, {
        secret: process.env.JWT_SUPADMIN_REFRESH_SECRET || 'supadmin-refresh-secret',
      });
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