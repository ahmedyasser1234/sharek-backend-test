import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  Logger,
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
  private readonly logger = new Logger(SupadminJwtGuard.name);

  constructor(
    private readonly supadminJwtService: SupadminJwtService,
    @InjectRepository(Supadmin)
    private readonly supadminRepo: Repository<Supadmin>, 
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    
    this.logger.debug(`=== SupadminJwtGuard Debug ===`);
    this.logger.debug(`URL: ${request.url}`);
    this.logger.debug(`Method: ${request.method}`);
    
    const token = this.extractToken(request);
    
    if (!token) {
      this.logger.error('No token found in request');
      throw new UnauthorizedException('Token not found');
    }

    this.logger.debug(`Token found: ${token.substring(0, 30)}...`);
    
    const payload = this.supadminJwtService.verify(token);
    
    if (!payload) {
      this.logger.error('Invalid token - verification failed');
      throw new UnauthorizedException('Invalid token');
    }

    this.logger.debug(`Token payload: ${JSON.stringify({
      supadminId: payload.supadminId,
      role: payload.role,
      hasPermissions: !!payload.permissions
    })}`);

    const supadmin = await this.supadminRepo.findOne({
      where: { id: payload.supadminId, isActive: true },
    });

    if (!supadmin) {
      this.logger.error(`Supadmin not found or inactive: ${payload.supadminId}`);
      throw new UnauthorizedException('Supadmin not found or inactive');
    }

    request.supadmin = supadmin;
    request.supadminId = supadmin.id;
    request.supadminRole = supadmin.role;
    request.supadminPermissions = supadmin.getPermissions();
    
    this.logger.debug(`Guard passed for supadmin: ${supadmin.email}`);
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