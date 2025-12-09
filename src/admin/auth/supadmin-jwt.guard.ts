import { 
  Injectable, 
  ExecutionContext, 
  UnauthorizedException,
  CanActivate,
  Request 
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { SupadminJwtService, SupadminJwtPayload } from './supadmin-jwt.service';

interface SupadminRequest extends Request {
  supadmin?: SupadminJwtPayload;
  supadminId?: string;
  supadminRole?: string;
  supadminPermissions?: Record<string, boolean>;
}

@Injectable()
export class SupadminJwtGuard implements CanActivate {
  constructor(private readonly supadminJwtService: SupadminJwtService) {}

  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest<SupadminRequest>();
    
    const authHeader = this.getAuthorizationHeader(request);
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('مطلوب توكن مصادقة');
    }

    const token = authHeader.substring(7);
    const payload = this.supadminJwtService.verifyAccess(token);

    if (!payload) {
      throw new UnauthorizedException('توكن غير صالح أو منتهي الصلاحية');
    }

    if (!this.isValidPayload(payload)) {
      throw new UnauthorizedException('توكن غير صالح - بيانات غير كاملة');
    }

    this.assignRequestData(request, payload);

    return true;
  }

  private getAuthorizationHeader(request: Request): string | null {
    const headers = request.headers as unknown as Record<string, string | string[] | undefined>;
    const authHeader = headers['authorization'] || headers['Authorization'];
    
    if (typeof authHeader === 'string') {
      return authHeader;
    }
    
    if (Array.isArray(authHeader) && authHeader.length > 0 && typeof authHeader[0] === 'string') {
      return authHeader[0];
    }

    return null;
  }

  private isValidPayload(payload: SupadminJwtPayload): boolean {
    return (
      typeof payload.supadminId === 'string' &&
      typeof payload.role === 'string' &&
      payload.permissions !== null &&
      typeof payload.permissions === 'object'
    );
  }

  private assignRequestData(request: SupadminRequest, payload: SupadminJwtPayload): void {
    request.supadmin = payload;
    request.supadminId = payload.supadminId;
    request.supadminRole = payload.role;
    request.supadminPermissions = payload.permissions;
  }
}