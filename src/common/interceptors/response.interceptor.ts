import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  UnauthorizedException,
  Logger,
  HttpException,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { SellerService } from '../../admin/manager.service';

interface RefreshTokenRequest {
  body?: {
    refreshToken?: string;
  };
  query?: {
    refreshToken?: string;
  };
  headers?: Record<string, string | undefined>;
}

@Injectable()
export class TokenRefreshInterceptor implements NestInterceptor {
  private readonly logger = new Logger(TokenRefreshInterceptor.name);

  constructor(private readonly sellerService: SellerService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      catchError((error: unknown) => {
        if (this.isHttpException(error) && error.getStatus() === 401) {
          this.logger.log('تم اكتشاف خطأ 401 - محاولة تجديد التوكن');
          
          const request = context.switchToHttp().getRequest<RefreshTokenRequest>();
          const refreshToken = this.extractRefreshToken(request);

          if (refreshToken) {
            return this.handleTokenRefresh(context, refreshToken, request);
          } else {
            this.logger.warn('لا يوجد refresh token متاح للتجديد');
          }
        }
        return throwError(() => error);
      })
    );
  }

  private extractRefreshToken(request: RefreshTokenRequest): string | null {
    try {
      const fromBody = request.body?.refreshToken;
      const fromQuery = request.query?.refreshToken;
      const fromHeaders = request.headers?.['x-refresh-token'];

      return fromBody || fromQuery || fromHeaders || null;
    } catch {
      return null;
    }
  }

  private async handleTokenRefresh(
    context: ExecutionContext, 
    refreshToken: string, 
    originalRequest: RefreshTokenRequest
  ): Promise<Observable<unknown>> {
    try {
      this.logger.log('محاولة تجديد التوكن باستخدام refresh token');
      
      const { accessToken } = await this.sellerService.refresh(refreshToken);
      
      this.logger.log('تم تجديد التوكن بنجاح');
      
      if (originalRequest.headers) {
        originalRequest.headers['authorization'] = `Bearer ${accessToken}`;
      }
      
      return throwError(() => new UnauthorizedException({
        message: 'تم تجديد التوكن، يرجى إعادة الطلب بالتوكن الجديد',
        newAccessToken: accessToken,
        shouldRetry: true
      }));
      
    } catch (refreshError: unknown) {
      const errorMessage = refreshError instanceof Error ? refreshError.message : 'Unknown error occurred';
      this.logger.error(`فشل تجديد التوكن: ${errorMessage}`);
      return throwError(() => new UnauthorizedException('فشل تجديد التوكن، يرجى تسجيل الدخول مرة أخرى'));
    }
  }

  private isHttpException(error: unknown): error is HttpException {
    return error instanceof HttpException;
  }
}