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
    
    this.logger.debug(` Checking endpoint: ${context.getHandler().name}`);
    this.logger.debug(` Is Public: ${isPublic}`);
    
    if (isPublic) {
      this.logger.debug(' Public endpoint - skipping auth');
      return true;
    }

    const req = context.switchToHttp().getRequest<CompanyRequest>();
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer '))
      throw new ForbiddenException('Missing or malformed Authorization header');

    const token = authHeader.slice(7).trim();
    
    this.logger.debug(` محاولة التحقق من التوكن: ${token.substring(0, 30)}...`);
    
    if (!token || typeof token !== 'string' || token.length < 20)
      throw new UnauthorizedException('Invalid or malformed token');

    try {
      const payload = this.jwtService.verify(token);
      if (!payload?.companyId)
        throw new UnauthorizedException('Invalid token payload');

      this.logger.debug(` تم فك تشفير التوكن للشركة: ${payload.companyId}`);

      const isRevoked = await this.revokedTokenRepo.findOne({ where: { token } });
      if (isRevoked) {
        this.logger.warn(` التوكن ملغي للشركة: ${payload.companyId}`);
        throw new ForbiddenException('Access Token has been revoked');
      }

      let isInactive = false;
      try {
        isInactive = await this.companyService.shouldLogoutDueToInactivity(payload.companyId);
        this.logger.debug(` حالة النشاط للشركة ${payload.companyId}: ${isInactive ? 'غير نشط' : 'نشط'}`);
      } catch (activityError: unknown) {
        const activityErrorMessage = this.getErrorMessage(activityError);
        this.logger.warn(` فشل التحقق من النشاط، المتابعة بدون تحقق: ${activityErrorMessage}`);
        isInactive = false;
      }

      if (isInactive) {
        this.logger.warn(` الشركة ${payload.companyId} انتهت جلستها بسبب عدم النشاط`);
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

      this.logger.debug(` تم التحقق من التوكن بنجاح للشركة: ${payload.companyId}`);
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