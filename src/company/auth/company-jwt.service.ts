import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

export interface CompanyPayload {
  companyId: string;
  role?: string;
  token?: string;
  [key: string]: unknown;
}

interface JwtError extends Error {
  name: string;
  message: string;
}

interface DecodedToken {
  companyId?: string;
  exp?: number;
  iat?: number;
  iss?: string;
  [key: string]: unknown;
}

@Injectable()
export class CompanyJwtService {
  private readonly logger = new Logger(CompanyJwtService.name);

  constructor(private readonly jwt: JwtService) {}

  signAccess(payload: CompanyPayload): string {
    const token = this.jwt.sign(payload, { 
      expiresIn: parseInt(process.env.JWT_EXPIRES_IN || '3600'),
      issuer: 'sharik-app'
    });
    this.logger.debug(` تم إنشاء توكن وصول جديد للشركة: ${payload.companyId}`);
    return token;
  }

  signRefresh(payload: CompanyPayload): string {
    const token = this.jwt.sign(payload, { 
      expiresIn: parseInt(process.env.JWT_REFRESH_EXPIRES_IN || '604800'),
      issuer: 'sharik-app'
    });
    this.logger.debug(` تم إنشاء توكن تحديث جديد للشركة: ${payload.companyId}`);
    return token;
  }

  verify<T extends CompanyPayload = CompanyPayload>(token: string): T {
    try {
      const payload = this.jwt.verify<T>(token);
      
      if (!payload.companyId) {
        this.logger.error(' التوكن لا يحتوي على companyId');
        throw new UnauthorizedException('الرجاء تسجيل الدخول');
      }
      
      this.logger.debug(` تم التحقق من التوكن بنجاح للشركة: ${payload.companyId}`);
      return payload;
    } catch (error: unknown) {
      const jwtError = error as JwtError;
      this.logger.error(` فشل التحقق من التوكن: ${jwtError.message}`);
      this.logger.debug(` نوع الخطأ: ${jwtError.name}, التوكن: ${token.substring(0, 20)}...`);
      
      if (jwtError.name === 'TokenExpiredError') {
        throw new UnauthorizedException('الجلسة منتهية يرجى تسجبل الدخول');
      } else if (jwtError.name === 'JsonWebTokenError') {
        throw new UnauthorizedException('الرجاء تسجيل الدخول');
      } else {
        throw new UnauthorizedException('الجلسة منتهية يرجى تسجبل الدخول');
      }
    }
  }

  async verifyAsync<T extends CompanyPayload = CompanyPayload>(token: string): Promise<T> {
    try {
      const payload = await this.jwt.verifyAsync<T>(token);
      
      if (!payload.companyId) {
        this.logger.error(' التوكن لا يحتوي على companyId');
        throw new UnauthorizedException('الرجاء تسجيل الدخول');
      }
      
      this.logger.debug(` تم التحقق من التوكن بشكل غير متزامن للشركة: ${payload.companyId}`);
      return payload;
    } catch (error: unknown) {
      const jwtError = error as JwtError;
      this.logger.error(` فشل التحقق من التوكن بشكل غير متزامن: ${jwtError.message}`);
      
      if (jwtError.name === 'TokenExpiredError') {
        throw new UnauthorizedException('Token expired');
      } else if (jwtError.name === 'JsonWebTokenError') {
        throw new UnauthorizedException('الرجاء تسجيل الدخول');
      } else {
        throw new UnauthorizedException('يرجى تسجيل الدخول');
      }
    }
  }

  decodeToken(token: string): CompanyPayload | null {
    try {
      const payload: unknown = this.jwt.decode(token);
      
      if (this.isCompanyPayload(payload)) {
        return payload;
      }
      
      this.logger.warn(' التوكن المفكوك لا يحتوي على companyId صالح');
      return null;
    } catch (error: unknown) {
      const err = error as Error;
      this.logger.error(` فشل فك تشفير التوكن: ${err.message}`);
      return null;
    }
  }

  isValidToken(token: string): boolean {
    try {
      const payload = this.verify(token);
      return !!payload.companyId;
    } catch {
      return false;
    }
  }

  getTokenExpiration(token: string): Date | null {
    try {
      const decoded: unknown = this.jwt.decode(token);
      
      if (this.isDecodedToken(decoded) && decoded.exp) {
        return new Date(decoded.exp * 1000);
      }
      
      return null;
    } catch {
      return null;
    }
  }

  private isCompanyPayload(payload: unknown): payload is CompanyPayload {
    return (
      typeof payload === 'object' &&
      payload !== null &&
      'companyId' in payload &&
      typeof (payload as CompanyPayload).companyId === 'string'
    );
  }

  private isDecodedToken(payload: unknown): payload is DecodedToken {
    return (
      typeof payload === 'object' &&
      payload !== null
    );
  }

  getTimeUntilExpiration(token: string): number | null {
    try {
      const expiration = this.getTokenExpiration(token);
      
      if (!expiration) {
        return null;
      }
      
      const now = Date.now();
      const expirationTime = expiration.getTime();
      
      return Math.max(0, expirationTime - now);
    } catch {
      return null;
    }
  }

  isTokenAboutToExpire(token: string, thresholdMinutes = 5): boolean {
    const timeUntilExpiration = this.getTimeUntilExpiration(token);
    
    if (timeUntilExpiration === null) {
      return true;
    }
    
    return timeUntilExpiration < thresholdMinutes * 60 * 1000;
  }

  getTokenInfo(token: string): {
    isValid: boolean;
    companyId: string | null;
    expiration: Date | null;
    timeUntilExpiration: number | null;
    isAboutToExpire: boolean;
  } {
    try {
      const payload = this.decodeToken(token);
      const expiration = this.getTokenExpiration(token);
      const timeUntilExpiration = this.getTimeUntilExpiration(token);
      const isAboutToExpire = this.isTokenAboutToExpire(token);

      return {
        isValid: this.isValidToken(token),
        companyId: payload?.companyId || null,
        expiration,
        timeUntilExpiration,
        isAboutToExpire,
      };
    } catch {
      return {
        isValid: false,
        companyId: null,
        expiration: null,
        timeUntilExpiration: null,
        isAboutToExpire: true,
      };
    }
  }
}