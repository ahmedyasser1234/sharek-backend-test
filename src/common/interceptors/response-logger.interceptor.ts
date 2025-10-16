import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Response, Request } from 'express';
import * as fs from 'node:fs';
import * as path from 'node:path';

type LoggedRequest = Request & {
  requestId: string;
  originalUrl: string;
};

@Injectable()
export class ResponseLoggerInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const now = Date.now();
    const res = context.switchToHttp().getResponse<Response>();
    const req = context.switchToHttp().getRequest<LoggedRequest>();
    const controller = context.getClass().name;
    const handler = context.getHandler().name;

    return next.handle().pipe(
      tap((data: unknown) => {
        const safeData =
          data && typeof data === 'object'
            ? JSON.parse(JSON.stringify(data)) as Record<string, unknown>
            : { raw: String(data) };

        const log = {
          requestId: req.requestId,
          time: new Date().toISOString(),
          controller,
          handler,
          method: req.method,
          url: req.originalUrl,
          statusCode: res.statusCode,
          duration: `${Date.now() - now}ms`,
          response: safeData,
        };

        fs.appendFileSync(
          path.join(__dirname, '../../../logs/responses.log'),
          JSON.stringify(log, null, 2) + ',\n',
        );
      }),
    );
  }
}
