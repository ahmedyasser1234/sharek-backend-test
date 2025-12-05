import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AdminService } from '../admin.service';
import { AdminRole } from '../entities/admin.entity';

interface AdminRequest {
  user?: {
    adminId: string;
    role: string;
    [key: string]: any;
  };
  [key: string]: any;
}

@Injectable()
export class SupervisorGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private adminService: AdminService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    const adminId = request.user?.adminId;

    if (!adminId || typeof adminId !== 'string') {
      throw new ForbiddenException('غير مصرح');
    }

    const requiredPermissions = this.reflector.get<string[]>(
      'permissions',
      context.getHandler(),
    );

    if (!requiredPermissions) {
      return true;
    }

    const admin = await this.adminService.getAdminById(adminId);
    
    if (!admin) {
      throw new ForbiddenException('الأدمن غير موجود');
    }

    if (admin.role === AdminRole.SUPER_ADMIN) {
      return true;
    }

    const hasPermission = requiredPermissions.some(permission =>
      admin.canAccess(permission),
    );

    if (!hasPermission) {
      throw new ForbiddenException('ليس لديك الصلاحية للوصول إلى هذا المورد');
    }

    return true;
  }
}