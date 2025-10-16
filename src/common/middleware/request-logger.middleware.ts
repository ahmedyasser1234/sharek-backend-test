import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as fs from 'node:fs';
import * as path from 'node:path';

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  use(
    req: Request<object, object, Record<string, unknown>>,
    res: Response,
    next: NextFunction,
  ): void {
    const log: {
      time: string;
      method: string;
      url: string;
      headers: Record<string, unknown>;
      body: Record<string, unknown>;
    } = {
      time: new Date().toISOString(),
      method: req.method,
      url: req.originalUrl,
      headers: req.headers as Record<string, unknown>,
      body: req.body,
    };

    fs.appendFileSync(
      path.join(__dirname, '../../../logs/requests.log'),
      JSON.stringify(log) + '\n',
      { encoding: 'utf8' },
    );

    next();
  }
}
