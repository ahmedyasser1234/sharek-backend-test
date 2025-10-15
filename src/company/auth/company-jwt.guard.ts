import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  ForbiddenException,
  UnauthorizedException,
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
    const req = context.switchToHttp().getRequest<CompanyRequest>();
    const path = req.path;

    // ✅ مسارات عامة
    const publicPathRegex = /^(\/card\/[^/]+|\/employee\/by-url\/[^/]+)$/;
    if (publicPathRegex.test(path)) return true;

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer '))
      throw new ForbiddenException('Missing or malformed Authorization header');

    const token = authHeader.slice(7).trim();
    if (!token || typeof token !== 'string' || token.length < 20)
      throw new UnauthorizedException('Invalid or malformed token');

    try {
      const payload = this.jwtService.verify(token);
      if (!payload?.companyId)
        throw new UnauthorizedException('Invalid token payload');

      const isRevoked = await this.revokedTokenRepo.findOne({ where: { token } });
      if (isRevoked)
        throw new ForbiddenException('Access Token has been revoked');

      req.user = {
        companyId: payload.companyId,
        role: payload.role || 'company',
        token,
      };

      return true;
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error(`❌ Token verification failed: ${errorMessage}`);
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
