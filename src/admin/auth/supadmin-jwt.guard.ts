import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Request } from 'express';
import { Supadmin } from '../entities/supadmin.entity';
import { SupadminJwtService } from './supadmin-jwt.service';

interface AuthenticatedRequest extends Request {
  supadmin?: Supadmin;
  supadminPayload?: {  
    supadminId: string;
    role: string;
    permissions: Record<string, boolean>;
    iat?: number;
    exp?: number;
  };
  managerPayload?: {
    supadminId: string;
    role: string;
    permissions: Record<string, boolean>;
    iat?: number;
    exp?: number;
  };
  user?: {
    supadminId: string;
    role: string;
    permissions: Record<string, boolean>;
  };
}

@Injectable()
export class SupadminJwtGuard implements CanActivate {
  constructor(
    private readonly supadminJwtService: SupadminJwtService,
    @InjectRepository(Supadmin)
    private readonly supadminRepo: Repository<Supadmin>, 
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Token not found');
    }

    const payload = this.supadminJwtService.verify(token);
    
    if (!payload) {
      throw new UnauthorizedException('Invalid token');
    }

    const supadmin = await this.supadminRepo.findOne({
      where: { id: payload.supadminId, isActive: true },
    });

    if (!supadmin) {
      throw new UnauthorizedException('Supadmin not found or inactive');
    }

    request.supadmin = supadmin;
    request.supadminPayload = payload;
    request.user = {
      supadminId: payload.supadminId,
      role: payload.role,
      permissions: payload.permissions,
    };
    
    return true;
  }

  private extractToken(request: AuthenticatedRequest): string | null {
    const authHeader = request.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }
    return null;
  }
}