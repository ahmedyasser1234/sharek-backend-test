import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Manager } from '../entities/manager.entity';

interface ManagerPayload {
  managerId: string;
  role: string;
  permissions?: Record<string, boolean>;
  iat?: number;
  exp?: number;
}

@Injectable()
export class ManagerJwtGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    @InjectRepository(Manager)
    private readonly managerRepo: Repository<Manager>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{
      manager?: Manager;
      managerPayload?: ManagerPayload;
      headers: { authorization?: string };
    }>();
    
    const token = this.extractToken(request);

    if (!token) {
      throw new UnauthorizedException('Token not found');
    }

    try {
      const payload = this.jwtService.verify<ManagerPayload>(token, {
        secret: process.env.MANAGER_JWT_SECRET || 'manager-secret-key',
      });
      
      const manager = await this.managerRepo.findOne({
        where: { id: payload.managerId, isActive: true },
      });

      if (!manager) {
        throw new UnauthorizedException('Manager not found or inactive');
      }

      request.manager = manager!;
      request.managerPayload = payload!;
      
      return true;
    } catch {
      throw new UnauthorizedException('Invalid token');
    }
  }

  private extractToken(request: { headers: { authorization?: string } }): string | null {
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }
    return null;
  }
}