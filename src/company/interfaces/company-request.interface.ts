import { Request } from 'express';

export interface CompanyRequest extends Request {
  user?: {
    companyId: string;
    role?: string;
    token?: string;
  };
}