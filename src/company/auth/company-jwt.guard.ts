import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { CompanyJwtService, CompanyPayload } from './company-jwt.service';
import { Request } from 'express';

interface CompanyRequest extends Request {
  user?: CompanyPayload;
}

@Injectable()
export class CompanyJwtGuard implements CanActivate {
  private readonly logger = new Logger(CompanyJwtGuard.name);

  constructor(private jwtService: CompanyJwtService) {}

  canActivate(context: ExecutionContext): boolean {
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

    const token = authHeader.split(' ')[1];
    this.logger.debug(`🔎 Extracted token: ${token}`);

    try {
      const payload = this.jwtService.verify(token);
      this.logger.debug(`✅ Decoded payload: ${JSON.stringify(payload)}`);

      if (!payload?.companyId) {
        this.logger.warn('🚫 companyId missing in payload');
        return false;
      }

      req.user = {
        companyId: payload.companyId,
        role: payload.role || 'company',
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
