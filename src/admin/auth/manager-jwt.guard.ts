import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Request } from 'express';
import { Manager } from '../entities/manager.entity';
import { ManagerJwtService } from './manager-jwt.service';

interface AuthenticatedRequest extends Request {
  manager?: Manager;
  managerPayload?: {
    managerId: string;
    role: string;
    permissions: Record<string, boolean>;
    iat?: number;
    exp?: number;
  };
  user?: {
    managerId: string;
    role: string;
    permissions: Record<string, boolean>;
  };
}

@Injectable()
export class ManagerJwtGuard implements CanActivate {
  constructor(
    private readonly managerJwtService: ManagerJwtService,
    @InjectRepository(Manager)
    private readonly managerRepo: Repository<Manager>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Token not found');
    }

    const payload = this.managerJwtService.verify(token);
    
    if (!payload) {
      throw new UnauthorizedException('Invalid token');
    }

    const manager = await this.managerRepo.findOne({
      where: { id: payload.managerId, isActive: true },
    });

    if (!manager) {
      throw new UnauthorizedException('Manager not found or inactive');
    }

    request.manager = manager;
    request.managerPayload = payload;
    request.user = {
      managerId: payload.managerId,
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