import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';

interface AdminPayload {
  adminId: string;
  role: string;
  iat?: number;
  exp?: number;
}

@Injectable()
export class AdminJwtGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const authHeader = req.headers.authorization;

    if (!authHeader) throw new UnauthorizedException('Authorization header missing');

    const [type, token] = authHeader.split(' ');
    if (type !== 'Bearer' || !token) throw new UnauthorizedException('Invalid token format');

    try {
      const payload: AdminPayload = await this.jwtService.verifyAsync(token);
      if (payload.role !== 'admin') {
        throw new UnauthorizedException('Access denied');
      }

      req.user = payload;
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error('JWT Error:', errorMessage);
      throw new UnauthorizedException('Invalid or expired token');
    }
  }
}
