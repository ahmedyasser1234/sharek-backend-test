import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Response } from 'express';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class ResponseLoggerInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const res = context.switchToHttp().getResponse<Response>();

    return next.handle().pipe(
      tap((data: unknown) => {
        const log = {
          time: new Date().toISOString(),
          statusCode: res.statusCode,
          response: data,
        };

        fs.appendFileSync(
          path.join(__dirname, '../../../logs/responses.log'),
          JSON.stringify(log) + '\n',
        );
      }),
    );
  }
}
