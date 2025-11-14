import { Request } from 'express';

export interface AdminRequest extends Request {
  user: {
    adminId: string;
    role: string;
  };
}