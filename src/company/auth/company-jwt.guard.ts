import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  ForbiddenException,
} from '@nestjs/common';
import { CompanyJwtService, CompanyPayload } from './company-jwt.service';
import { Request } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RevokedToken } from '../entities/revoked-token.entity';

interface CompanyRequest extends Request {
  user?: CompanyPayload;
}

@Injectable()
export class CompanyJwtGuard implements CanActivate {
  private readonly logger = new Logger(CompanyJwtGuard.name);

  constructor(
    private readonly jwtService: CompanyJwtService,
    @InjectRepository(RevokedToken)
    private readonly revokedTokenRepo: Repository<RevokedToken>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    this.logger.debug('🛡️ CompanyJwtGuard activated');
    const req = context.switchToHttp().getRequest<CompanyRequest>();
    const path = req.path;

    const publicPathRegex = /^(\/card\/[^/]+|\/employee\/by-url\/[^/]+)$/;
    if (publicPathRegex.test(path)) {
      this.logger.debug(`🔓 Public route matched (${path}), skipping guard`);
      return true;
    }

    const authHeader = req.headers.authorization;
    this.logger.debug(`🔑 Raw Authorization header: ${authHeader}`);

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      this.logger.warn('🚫 Authorization header missing or malformed');
      return false;
    }

    const token = authHeader.slice(7).trim();
    this.logger.debug(`🔎 Extracted token: ${token}`);

    if (!token || typeof token !== 'string' || token.length < 20) {
      this.logger.warn('🚫 توكن غير صالح');
      return false;
    }

    try {
      const payload = this.jwtService.verify(token);
      this.logger.debug(`✅ Decoded payload: ${JSON.stringify(payload)}`);

      if (!payload?.companyId) {
        this.logger.warn('🚫 companyId missing in payload');
        return false;
      }

      // ✅ تحقق من أن التوكن غير ملغي بعد فك التوكن
      const cleanedToken = token.trim();
      this.logger.debug(`🧾 التحقق من التوكن الملغي: ${cleanedToken}`);

      const isRevoked = await this.revokedTokenRepo.findOne({ where: { token: cleanedToken } });
      if (isRevoked) {
        this.logger.warn(`❌ تم استخدام Access Token ملغي: ${cleanedToken}`);
        throw new ForbiddenException('Access Token has been revoked');
      }

      req.user = {
        companyId: payload.companyId,
        role: payload.role || 'company',
        token: cleanedToken,
      };

      this.logger.log(`📦 req.user set: ${JSON.stringify(req.user)}`);
      return true;
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`❌ Token verification failed: ${errorMessage}`);
      return false;
    }
  }
}
