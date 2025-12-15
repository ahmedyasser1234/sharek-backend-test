import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpStatus,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Response } from 'express';

interface ApiResponse<T> {
  statusCode: number;
  success: boolean;
  message: string | null;
  data: T | null;
}

@Injectable()
export class ResponseInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<ApiResponse<T>> {
    const ctx = context.switchToHttp();
    const res = ctx.getResponse<Response>();

    const defaultStatus: HttpStatus =
      (res?.statusCode as HttpStatus) ?? HttpStatus.OK;

    return next.handle().pipe(
      map((controllerResult: T): ApiResponse<T> => {
        if (
          controllerResult &&
          typeof controllerResult === 'object' &&
          ('statusCode' in controllerResult || 'success' in controllerResult)
        ) {
          return controllerResult as unknown as ApiResponse<T>;
        }

        let message: string | null = null;
        if (
          controllerResult &&
          typeof controllerResult === 'object' &&
          'message' in controllerResult &&
          typeof (controllerResult as { message?: unknown }).message === 'string'
        ) {
          message = (controllerResult as { message: string }).message;
        }

        let payload: T | null;
        if (
          controllerResult &&
          typeof controllerResult === 'object' &&
          'data' in controllerResult
        ) {
          payload = (controllerResult as { data: T }).data;
        } else {
          payload = controllerResult ?? null;
        }

        const finalResponse: ApiResponse<T> = {
          statusCode: defaultStatus,
          success: true,
          message:
            message ??
            (defaultStatus === HttpStatus.CREATED
              ? 'Created successfully'
              : 'Request successful'),
          data: payload,
        };

        return finalResponse;
      }),
    );
  }
}