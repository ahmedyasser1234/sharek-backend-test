import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CompanyJwtService, CompanyPayload } from './company-jwt.service';
import { Request } from 'express';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RevokedToken } from '../entities/revoked-token.entity';
import { CompanyService } from '../company.service'; 

interface CompanyRequest extends Request {
  user?: CompanyPayload;
}

@Injectable()
export class CompanyJwtGuard implements CanActivate {
  private readonly logger = new Logger(CompanyJwtGuard.name);

  constructor(
    private readonly jwtService: CompanyJwtService,
    private readonly reflector: Reflector,
    @InjectRepository(RevokedToken)
    private readonly revokedTokenRepo: Repository<RevokedToken>,
    private readonly companyService: CompanyService, 
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>('isPublic', [
      context.getHandler(),
      context.getClass(),
    ]);
    
    if (isPublic) {
      return true;
    }

    const req = context.switchToHttp().getRequest<CompanyRequest>();
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer '))
      throw new ForbiddenException('الوقت المسموح به انتهى، يرجى تسجيل الدخول مجدداً');

    const token = authHeader.slice(7).trim();
    
    if (!token || typeof token !== 'string' || token.length < 20)
      throw new UnauthorizedException('Invalid or malformed token');

    try {
      const payload = this.jwtService.verify(token);
      if (!payload?.companyId)
        throw new UnauthorizedException('الرجاء تسجيل الدخول');

      const isRevoked = await this.revokedTokenRepo.findOne({ where: { token } });
      if (isRevoked) {
        throw new ForbiddenException('يرجى تسجيل الدخول مجدداً');
      }

      let isInactive = false;
      try {
        isInactive = await this.companyService.shouldLogoutDueToInactivity(payload.companyId);
      } catch (activityError: unknown) {
        const activityErrorMessage = this.getErrorMessage(activityError);
        this.logger.error(` فشل التحقق من النشاط: ${activityErrorMessage}`);
        isInactive = false;
      }

      if (isInactive) {
        await this.companyService.markUserAsOffline(payload.companyId);
        throw new UnauthorizedException('تم الخروج تلقائياً بسبب عدم النشاط');
      }

      req.user = {
        companyId: payload.companyId,
        role: payload.role || 'company',
        token,
      };

      this.companyService.recordUserActivity(payload.companyId, `access: ${req.method} ${req.url}`)
        .catch((error: unknown) => {
          const errorMessage = this.getErrorMessage(error);
          this.logger.error(` فشل تسجيل النشاط: ${errorMessage}`);
        });

      return true;

    } catch (err: unknown) {
      const errorMessage = this.getErrorMessage(err);
      this.logger.error(` Token verification failed: ${errorMessage}`);
      
      if (err instanceof UnauthorizedException || err instanceof ForbiddenException) {
        throw err;
      }
      
      throw new UnauthorizedException('يرجى تسجيل الدخول');
    }
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    return 'Unknown error occurred';
  }
}