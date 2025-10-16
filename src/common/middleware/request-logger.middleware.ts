import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'crypto';

type LoggedRequest = Request & { requestId: string };

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  use(req: LoggedRequest, res: Response, next: NextFunction): void {
    req.requestId = randomUUID();

    const log = {
      requestId: req.requestId,
      time: new Date().toISOString(),
      method: req.method,
      url: req.originalUrl,
      ip: req.ip,
      headers: Object.fromEntries(
        Object.entries(req.headers).map(([key, value]) => [key, String(value)]),
      ),
      body:
        req.body && typeof req.body === 'object'
          ? JSON.parse(JSON.stringify(req.body)) as Record<string, unknown>
          : {},
    };

    fs.appendFileSync(
      path.join(__dirname, '../../../logs/requests.log'),
      JSON.stringify(log, null, 2) + ',\n',
      { encoding: 'utf8' },
    );

    next();
  }
}
