import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

export interface AdminPayload {
  adminId: string;
  role?: string;
  [key: string]: unknown;
}

@Injectable()
export class AdminJwtService {
  constructor(private readonly jwt: JwtService) {}

  signAccess(payload: AdminPayload): string {
    return this.jwt.sign(payload, { 
      expiresIn: parseInt(process.env.JWT_EXPIRES_IN || '86400')
    });
  }

  signRefresh(payload: AdminPayload): string {
    return this.jwt.sign(payload, { 
      expiresIn: parseInt(process.env.JWT_REFRESH_EXPIRES_IN || '604800')
    });
  }

  verify(token: string): AdminPayload {
    return this.jwt.verify(token);
  }

  verifyRefresh(token: string): AdminPayload {
    return this.jwt.verify(token);
  }
}