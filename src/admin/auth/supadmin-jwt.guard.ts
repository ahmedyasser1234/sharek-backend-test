import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Supadmin } from '../entities/supadmin.entity';
import { SupadminJwtService } from './supadmin-jwt.service';

interface RequestWithAuth {
  headers?: {
    authorization?: string;
  };
  query?: {
    token?: string;
  };
  url?: string;
  method?: string;
}

interface AuthenticatedRequest extends RequestWithAuth {
  supadmin?: Supadmin;
  supadminId?: string;
  supadminRole?: string;
  supadminPermissions?: Record<string, boolean>;
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
    request.supadminId = supadmin.id;
    request.supadminRole = supadmin.role;
    request.supadminPermissions = supadmin.getPermissions();
    
    return true;
  }

  private extractToken(request: RequestWithAuth): string | null {
    const authHeader = request.headers?.authorization;
    
    if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }
    
    const queryToken = request.query?.token;
    if (queryToken && typeof queryToken === 'string') {
      return queryToken;
    }
    
    return null;
  }
}